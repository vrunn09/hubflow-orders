import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { appUserReconnectRequired, callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { ingestOrder } from "./ingest.server";

type Admin = SupabaseClient<Database>;
export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const GMAIL_CONNECTOR = "google_mail";
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
];

/* ---------- encryption of the per-restaurant connection key ---------- */
function key(): Buffer {
  const raw = process.env["APP_USER_CONNECTION_KEY_SECRET"];
  if (!raw) throw new Error("APP_USER_CONNECTION_KEY_SECRET is not set");
  return Buffer.from(raw, "base64");
}
export function encryptKey(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
export function decryptKey(stored: string) {
  const buf = Buffer.from(stored, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

/* ---------- platform detection (sender/domain/name/subject only; never guess) ---------- */
const PLATFORMS: { name: string; patterns: RegExp[] }[] = [
  { name: "ZOOP", patterns: [/zoop/i] },
  { name: "RAILRESTRO", patterns: [/railrestro/i] },
  { name: "RAILRECIPE", patterns: [/railrecipe/i] },
  { name: "RAILYATRI", patterns: [/railyatri/i] },
  { name: "YATRIRESTRO", patterns: [/yatrirestro/i] },
  { name: "IRCTC_ECATERING", patterns: [/irctc/i, /e-?catering/i] },
  { name: "POOJA_PEDA", patterns: [/pooja\s*-?peda/i, /poojapeda/i] },
  { name: "TRAVELKHANA", patterns: [/travelkhana/i] },
  { name: "ZOMATO", patterns: [/zomato/i] },
  { name: "SWIGGY", patterns: [/swiggy/i] },
];
export function detectPlatform(sender: string, subject: string) {
  const fromHit = PLATFORMS.find((p) => p.patterns.some((r) => r.test(sender)));
  if (fromHit) return fromHit.name;
  const subjHit = PLATFORMS.find((p) => p.patterns.some((r) => r.test(subject)));
  return subjHit?.name ?? "UNKNOWN";
}

/* ---------- food-order classifier (rule-based score before AI extraction) ---------- */
const POSITIVE = [/order\s*(id|no|number|#)/i, /\bpnr\b/i, /\bcoach\b/i, /\bseat\b|\bberth\b/i, /train\s*(no|number)?/i, /\bstation\b/i,
  /\bqty\b|quantity|\bx\s*\d+|\d+\s*x\b/i, /₹|\brs\.?\s*\d|\binr\b/i, /new order|order (placed|received|confirmed)|booking confirmed/i, /thali|biryani|meal|veg|paneer|roti|food/i];
const NEGATIVE = [/unsubscribe/i, /\boffer\b|\bsale\b|discount code|coupon|cashback/i, /newsletter/i, /\botp\b|one[- ]time password|verification code/i,
  /password reset|security alert|sign[- ]in attempt/i, /statement|invoice for your subscription/i];
export function classifyEmail(text: string, platform: string) {
  let score = POSITIVE.reduce((s, r) => s + (r.test(text) ? 1 : 0), 0) / POSITIVE.length;
  if (platform !== "UNKNOWN") score += 0.2;
  score -= NEGATIVE.reduce((s, r) => s + (r.test(text) ? 0.15 : 0), 0);
  const confidence = Math.max(0, Math.min(1, Number(score.toFixed(2))));
  const classification = confidence >= 0.5 ? "order" : confidence >= 0.3 ? "needs_review" : "not_order";
  return { classification, confidence } as const;
}

/* ---------- Gmail message helpers ---------- */
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
function b64url(s: string) { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); }
function extractText(p: Part): string {
  if (p.mimeType === "text/plain" && p.body?.data) return b64url(p.body.data);
  for (const c of p.parts ?? []) { const t = extractText(c); if (t) return t; }
  if (p.mimeType === "text/html" && p.body?.data) return b64url(p.body.data).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  for (const c of p.parts ?? []) if (c.mimeType === "text/html" && c.body?.data) return extractText(c);
  return "";
}

const SEARCH = "newer_than:2d -in:spam -in:trash -category:promotions (subject:(order OR booking OR \"new order\") OR from:(irctc OR zoop OR railrestro OR yatrirestro OR railrecipe OR railyatri OR poojapeda OR travelkhana OR zomato OR swiggy))";

export interface SyncResult { checked: number; imported: number; needsReview: number; skipped: number; duplicates: number; reconnectRequired?: boolean }

/** Pulls new candidate order emails for one restaurant through the order pipeline. Idempotent on Gmail message id. */
export async function syncGmailForRestaurant(admin: Admin, restaurantId: string): Promise<SyncResult> {
  const { data: acct } = await admin.from("connected_email_accounts").select("*").eq("restaurant_id", restaurantId).maybeSingle();
  if (!acct) throw new Error("Gmail is not connected");
  if (acct.connection_status === "reconnect_required") return { checked: 0, imported: 0, needsReview: 0, skipped: 0, duplicates: 0, reconnectRequired: true };
  const connectionAPIKey = decryptKey(acct.connection_key_ciphertext);
  const call = (path: string) => callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: GMAIL_CONNECTOR, path, requiredScopes: GMAIL_SCOPES });
  const fail = async (res: Response) => {
    if (await appUserReconnectRequired(res)) {
      await admin.from("connected_email_accounts").update({ connection_status: "reconnect_required", last_error: "Gmail access expired — reconnect", updated_at: new Date().toISOString() }).eq("id", acct.id);
      return true;
    }
    const body = await res.text();
    console.error(`Gmail API failed [${res.status}]: ${body.slice(0, 300)}`);
    await admin.from("connected_email_accounts").update({ last_error: `Gmail API error ${res.status}`, updated_at: new Date().toISOString() }).eq("id", acct.id);
    throw new Error(`Gmail API error ${res.status}`);
  };

  // Only emails that arrived after this Gmail was connected — never import older orders.
  const since = Math.floor(new Date(acct.created_at).getTime() / 1000);
  const list = await call(`/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(`${SEARCH} after:${since}`)}`);
  if (!list.ok) { if (await fail(list)) return { checked: 0, imported: 0, needsReview: 0, skipped: 0, duplicates: 0, reconnectRequired: true }; }
  const ids: string[] = ((await list.json()).messages ?? []).map((m: { id: string }) => m.id);
  const r: SyncResult = { checked: 0, imported: 0, needsReview: 0, skipped: 0, duplicates: 0 };
  if (ids.length) {
    const { data: known } = await admin.from("imported_emails").select("gmail_message_id").eq("restaurant_id", restaurantId).in("gmail_message_id", ids);
    const seen = new Set((known ?? []).map((k) => k.gmail_message_id));
    for (const id of ids.filter((x) => !seen.has(x))) {
      const res = await call(`/gmail/v1/users/me/messages/${id}?format=full`);
      if (!res.ok) { if (await fail(res)) { r.reconnectRequired = true; break; } continue; }
      const msg = await res.json();
      if (msg.internalDate && Number(msg.internalDate) < new Date(acct.created_at).getTime()) continue;
      r.checked++;
      const h = (n: string) => (msg.payload?.headers ?? []).find((x: { name: string }) => x.name.toLowerCase() === n)?.value ?? "";
      const sender = h("from"); const subject = h("subject");
      const senderDomain = sender.match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? null;
      const body = extractText(msg.payload ?? {}).slice(0, 20000);
      const platform = detectPlatform(sender, subject);
      const { classification, confidence } = classifyEmail(`${subject}\n${body}`, platform);
      const base = {
        restaurant_id: restaurantId, gmail_message_id: id, thread_id: msg.threadId ?? null, sender: sender.slice(0, 300),
        sender_domain: senderDomain, subject: subject.slice(0, 500), received_at: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
        platform, classification, confidence, snippet: (msg.snippet ?? "").slice(0, 300), processed_at: new Date().toISOString(),
      };
      // Claim the message id first — the unique index makes the pipeline idempotent.
      const { error: claimErr } = await admin.from("imported_emails").insert({ ...base, processing_status: "pending" });
      if (claimErr) { r.duplicates++; continue; }
      if (classification === "not_order") {
        await admin.from("imported_emails").update({ processing_status: "skipped" }).eq("restaurant_id", restaurantId).eq("gmail_message_id", id);
        r.skipped++; continue;
      }
      if (classification === "needs_review") {
        await admin.from("imported_emails").update({ processing_status: "needs_review" }).eq("restaurant_id", restaurantId).eq("gmail_message_id", id);
        r.needsReview++; continue;
      }
      const out = await ingestOrder(admin, {
        restaurantId, sourceId: acct.source_id!, connectorKey: "gmail_api",
        raw: { messageId: id, threadId: msg.threadId, from: sender, subject, platform, body },
      });
      const status = out.status === "created" ? "imported" : out.status === "duplicate" ? "duplicate" : "needs_review";
      if (out.orderId && out.status === "created") await admin.from("orders").update({ source_platform: platform }).eq("id", out.orderId);
      await admin.from("imported_emails").update({ processing_status: status, order_id: out.orderId ?? null, error_message: out.error?.slice(0, 300) ?? null })
        .eq("restaurant_id", restaurantId).eq("gmail_message_id", id);
      if (status === "imported") r.imported++; else if (status === "duplicate") r.duplicates++; else r.needsReview++;
    }
  }
  await admin.from("connected_email_accounts").update({
    last_checked_at: new Date().toISOString(), emails_processed: acct.emails_processed + r.checked,
    ...(r.reconnectRequired ? {} : { last_error: null }), updated_at: new Date().toISOString(),
  }).eq("id", acct.id);
  if (acct.source_id) await admin.from("order_sources").update({ last_sync_at: new Date().toISOString() }).eq("id", acct.source_id);
  return r;
}
