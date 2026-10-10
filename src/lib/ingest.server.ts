import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getConnector } from "./connectors/registry";
import { INGEST_ERRORS, IngestError, backoffMs, classifyIngestError, dedupeKeyFor, isStatusUpdateSubject, type IngestErrorCode } from "./ingest-errors";

type Admin = SupabaseClient<Database>;

export interface IngestResult {
  /** created = new order; duplicate = already exists; ignored = not a new order; needs_review = permanent problem; failed = will retry */
  status: "created" | "duplicate" | "ignored" | "needs_review" | "failed";
  orderId?: string | undefined;
  error?: string;
  errorCode?: IngestErrorCode;
  jobId?: string | undefined;
}

function logIngest(level: "info" | "error", event: string, f: Record<string, unknown>) {
  // Structured, PII-free log line (ids + codes only; never payload/tokens).
  (level === "error" ? console.error : console.log)(JSON.stringify({ scope: "ingest", event, ...f }));
}

/** Upserts one grouped alert per (source, error code) instead of one per failure. */
async function raiseAlert(admin: Admin, restaurantId: string, sourceId: string, connectorKey: string, code: IngestErrorCode, reason: string, subject?: string) {
  const group_key = `ingest:${sourceId}:${code}`;
  const title = code === "VALIDATION_NO_ITEMS" || !INGEST_ERRORS[code].retryable ? "Order import needs review" : "Order import failed — retrying";
  const body = `${INGEST_ERRORS[code].label} (${connectorKey}, ${code})${subject ? ` · "${subject.slice(0, 80)}"` : ""}${reason && reason !== INGEST_ERRORS[code].label ? ` — ${reason.slice(0, 160)}` : ""}`;
  const { data: open } = await admin.from("notifications").select("id, occurrences")
    .eq("restaurant_id", restaurantId).eq("group_key", group_key).is("resolved_at", null).maybeSingle();
  if (open) await admin.from("notifications").update({ occurrences: open.occurrences + 1, body, title, read: false, created_at: new Date().toISOString() }).eq("id", open.id);
  else await admin.from("notifications").insert({ restaurant_id: restaurantId, category: "integration", title, body, group_key, link: "/notifications" });
}

/** Resolves grouped alerts for a source once no open job with that code remains. */
async function resolveAlerts(admin: Admin, restaurantId: string, sourceId: string | null) {
  if (!sourceId) return;
  const { data: openAlerts } = await admin.from("notifications").select("id, group_key").eq("restaurant_id", restaurantId)
    .like("group_key", `ingest:${sourceId}:%`).is("resolved_at", null);
  for (const n of openAlerts ?? []) {
    const code = n.group_key?.split(":")[2] ?? "";
    const { count } = await admin.from("ingestion_jobs").select("id", { count: "exact", head: true })
      .eq("source_id", sourceId).eq("error_code", code).in("status", ["failed", "needs_review", "dead_letter", "processing"]);
    if (!count) await admin.from("notifications").update({ resolved_at: new Date().toISOString(), read: true }).eq("id", n.id);
  }
}

/**
 * Central order ingestion pipeline.
 * Persist job (dedupe by message id) → Validate → Normalize (connector, then AI fallback) → Duplicate check →
 * Transactional save (order+items+history+payment+alert) → mark job done.
 * Retries reuse the same job row (`jobId`) — they never spawn new jobs or new alerts.
 */
export async function ingestOrder(
  admin: Admin,
  args: { restaurantId: string; sourceId: string; connectorKey: string; raw: unknown; actorId?: string | null; jobId?: string },
): Promise<IngestResult> {
  const now = () => new Date().toISOString();
  let job: { id: string; attempts: number; max_attempts: number };

  if (args.jobId) {
    const { data, error } = await admin.from("ingestion_jobs").select("id, attempts, max_attempts").eq("id", args.jobId).single();
    if (error || !data) throw new Error("Ingestion job not found");
    job = { ...data, attempts: data.attempts + 1 };
    await admin.from("ingestion_jobs").update({ status: "processing", attempts: job.attempts, last_attempt_at: now(), updated_at: now() }).eq("id", job.id);
  } else {
    const dedupe_key = dedupeKeyFor(args.raw);
    const { data, error } = await admin.from("ingestion_jobs")
      .insert({ restaurant_id: args.restaurantId, source_id: args.sourceId, payload: (args.raw ?? null) as never, status: "processing", attempts: 1, dedupe_key, last_attempt_at: now() })
      .select("id, attempts, max_attempts").single();
    if (error) {
      if (error.code === "23505" && dedupe_key) {
        const { data: prev } = await admin.from("ingestion_jobs").select("id, status, order_id").eq("restaurant_id", args.restaurantId).eq("dedupe_key", dedupe_key).neq("status", "superseded").maybeSingle();
        logIngest("info", "duplicate_message", { jobId: prev?.id, status: prev?.status });
        return { status: "duplicate", orderId: prev?.order_id ?? undefined, jobId: prev?.id };
      }
      throw error;
    }
    job = data;
  }

  const finish = (patch: Partial<Database["public"]["Tables"]["ingestion_jobs"]["Update"]>) =>
    admin.from("ingestion_jobs").update({ ...patch, updated_at: now() }).eq("id", job.id);

  try {
    if (args.raw == null || (typeof args.raw === "string" && !args.raw.trim())) throw new IngestError("INVALID_PAYLOAD", INGEST_ERRORS.INVALID_PAYLOAD.label);
    const subject = typeof args.raw === "object" ? (args.raw as { subject?: string }).subject : undefined;
    if (isStatusUpdateSubject(subject)) throw new IngestError("STATUS_UPDATE_EMAIL", INGEST_ERRORS.STATUS_UPDATE_EMAIL.label);

    const connector = getConnector(args.connectorKey);
    let order;
    try {
      order = connector.normalize(args.raw);
    } catch (e) {
      if (!connector.aiFallback) throw e;
      const { aiNormalizeOrder } = await import("./ai-normalize.server");
      order = await aiNormalizeOrder(args.raw, connector.name);
    }

    const { data: existing } = await admin.from("orders").select("id")
      .eq("restaurant_id", args.restaurantId).eq("source_key", args.connectorKey).eq("external_order_id", order.external_order_id).maybeSingle();
    if (existing) {
      await finish({ status: "duplicate", order_id: existing.id, error_code: null, last_error: null });
      await resolveAlerts(admin, args.restaurantId, args.sourceId);
      return { status: "duplicate", orderId: existing.id, jobId: job.id };
    }

    const platform = typeof args.raw === "object" ? (args.raw as { platform?: string }).platform : undefined;
    const { items, ...rest } = order;
    const { data: created, error } = await admin.rpc("create_ingested_order", {
      _rid: args.restaurantId, _source_id: args.sourceId, _source_key: args.connectorKey,
      _o: { ...rest, source_platform: platform && platform !== "UNKNOWN" ? platform : null } as never,
      _items: items as never, _raw: (args.raw ?? null) as never, _actor: (args.actorId ?? null) as never,
    });
    if (error) {
      if (error.code === "23505") { await finish({ status: "duplicate", error_code: null, last_error: null }); return { status: "duplicate", jobId: job.id }; }
      throw new IngestError("DB_ERROR", `${error.code ?? ""} ${error.message}`.trim().slice(0, 200));
    }
    const orderId = (created as { id: string }).id;
    await finish({ status: "done", order_id: orderId, error_code: null, last_error: null });
    await resolveAlerts(admin, args.restaurantId, args.sourceId);
    logIngest("info", "order_created", { jobId: job.id, orderId, connector: args.connectorKey, attempt: job.attempts });
    return { status: "created", orderId, jobId: job.id };
  } catch (e) {
    const { code, reason } = classifyIngestError(e);
    const spec = INGEST_ERRORS[code];
    const subject = args.raw && typeof args.raw === "object" ? (args.raw as { subject?: string }).subject : undefined;
    let status: "failed" | "needs_review" | "dead_letter" | "ignored";
    if (code === "STATUS_UPDATE_EMAIL") status = "ignored";
    else if (!spec.retryable) status = "needs_review";
    else status = job.attempts >= job.max_attempts ? "dead_letter" : "failed";
    await finish({ status, error_code: code, last_error: reason, ...(status === "failed" ? { next_attempt_at: new Date(Date.now() + backoffMs(job.attempts)).toISOString() } : {}) });
    logIngest("error", "ingest_failed", { jobId: job.id, connector: args.connectorKey, code, status, attempt: job.attempts });
    if (status !== "ignored") await raiseAlert(admin, args.restaurantId, args.sourceId, args.connectorKey, code, reason, subject);
    return {
      status: status === "ignored" ? "ignored" : status === "failed" ? "failed" : "needs_review",
      error: reason, errorCode: code, jobId: job.id,
    };
  }
}

export async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Keeps the Gmail inbox log in step with a job's final outcome. */
async function syncImportedEmail(admin: Admin, restaurantId: string, raw: unknown, r: IngestResult) {
  const messageId = raw && typeof raw === "object" ? (raw as { messageId?: string }).messageId : undefined;
  if (!messageId) return;
  const processing_status = r.status === "created" ? "imported" : r.status === "duplicate" ? "duplicate" : r.status === "ignored" ? "status_update" : r.status === "failed" ? "failed" : "needs_review";
  await admin.from("imported_emails").update({ processing_status, order_id: r.orderId ?? null, error_message: r.error?.slice(0, 300) ?? null, processed_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId).eq("gmail_message_id", messageId);
}

/** Re-runs one job in place (used by automatic retries and the manual Retry button). */
export async function retryJob(admin: Admin, jobId: string): Promise<IngestResult> {
  const { data: job } = await admin.from("ingestion_jobs").select("*").eq("id", jobId).single();
  if (!job) throw new Error("Job not found");
  if (!job.source_id) throw new Error("Job has no source");
  const { data: src } = await admin.from("order_sources").select("connector_key,status").eq("id", job.source_id).maybeSingle();
  if (!src) throw new Error("Order source no longer exists");
  const r = await ingestOrder(admin, { restaurantId: job.restaurant_id, sourceId: job.source_id, connectorKey: src.connector_key, raw: job.payload, jobId: job.id });
  await syncImportedEmail(admin, job.restaurant_id, job.payload, r);
  return r;
}

/** Re-runs failed jobs whose backoff has elapsed. Atomically claims each job so parallel runners never double-process. */
export async function retryDueJobs(admin: Admin, restaurantId?: string, sourceId?: string) {
  let q = admin.from("ingestion_jobs").select("id, attempts, max_attempts, source_id").eq("status", "failed")
    .lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(25);
  if (restaurantId) q = q.eq("restaurant_id", restaurantId);
  if (sourceId) q = q.eq("source_id", sourceId);
  const { data: jobs } = await q;
  let recovered = 0, checked = 0;
  for (const job of jobs ?? []) {
    if (job.attempts >= job.max_attempts) { await admin.from("ingestion_jobs").update({ status: "dead_letter" }).eq("id", job.id); continue; }
    const { data: claimed } = await admin.from("ingestion_jobs").update({ status: "processing" }).eq("id", job.id).eq("status", "failed").select("id");
    if (!claimed?.length) continue;
    checked++;
    try {
      const r = await retryJob(admin, job.id);
      if (r.status === "created" || r.status === "duplicate") recovered++;
    } catch (e) {
      await admin.from("ingestion_jobs").update({ status: "failed", next_attempt_at: new Date(Date.now() + backoffMs(job.attempts + 1)).toISOString() }).eq("id", job.id);
      logIngest("error", "retry_crashed", { jobId: job.id, msg: e instanceof Error ? e.message.slice(0, 120) : "?" });
    }
  }
  return { checked, recovered };
}
