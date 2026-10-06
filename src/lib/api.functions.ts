import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getConnector } from "./connectors/registry";
import { unifiedOrderSchema } from "./connectors/types";
import { ALLOWED, STATUS_ROLES, type OrderStatus } from "./order-status";

type Role = "owner" | "manager" | "kitchen" | "delivery" | "admin";
type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function requireRole(ctx: Ctx, restaurantId: string, roles: Role[]) {
  const { data, error } = await ctx.supabase.rpc("has_any_role", { _rid: restaurantId, _roles: roles });
  if (error || !data) throw new Error("Permission denied");
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function audit(restaurantId: string | null, actor: string, action: string, entity: string, entityId: string, meta: object = {}) {
  const a = await admin();
  await a.from("audit_logs").insert({ restaurant_id: restaurantId, actor_id: actor, action, entity, entity_id: entityId, meta: meta as never });
}
async function loadOrder(id: string) {
  const a = await admin();
  const { data, error } = await a.from("orders").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Order not found");
  return data;
}

const uuid = z.string().uuid();

/* ---------------- Tenancy ---------------- */

export const claimInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string }).email?.toLowerCase();
    if (!email) return { claimed: 0 };
    const a = await admin();
    const { data } = await a.from("restaurant_members").update({ user_id: context.userId })
      .is("user_id", null).ilike("invited_email", email).select("id");
    await a.from("delivery_partners").update({ user_id: context.userId }).is("user_id", null).ilike("phone", email);
    return { claimed: data?.length ?? 0 };
  });

/* ---------------- Order sources / connector engine ---------------- */

export const connectSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    restaurantId: uuid, connectorKey: z.string().min(1), displayName: z.string().min(2).max(60),
    environment: z.enum(["mock", "production"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.restaurantId, ["owner", "manager"]);
    const connector = getConnector(data.connectorKey);
    if (data.environment === "production" && !connector.productionReady) {
      throw new Error(`${connector.name} production access is not available yet. ${connector.productionNote}`);
    }
    const a = await admin();
    let webhookSecret: string | null = null;
    const config: Record<string, unknown> = {};
    if (data.environment === "production" && connector.methods.includes("webhook")) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      webhookSecret = "whsec_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      const { sha256Hex } = await import("./ingest.server");
      config["webhook_secret_hash"] = await sha256Hex(webhookSecret); // only the hash is stored
    }
    const { data: src, error } = await a.from("order_sources").upsert({
      restaurant_id: data.restaurantId, connector_key: connector.key, display_name: data.displayName,
      environment: data.environment, status: "connected", health: "healthy", last_error: null,
      connected_account: data.environment === "mock" ? "Test sandbox" : null, config: config as never,
    }, { onConflict: "restaurant_id,connector_key,display_name" }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(data.restaurantId, context.userId, "source.connected", "order_source", src.id, { connector: connector.key, env: data.environment });
    return { sourceId: src.id, webhookSecret, webhookPath: webhookSecret ? `/api/public/ingest/${src.id}` : null };
  });

export const testSourceConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restaurantId: uuid, connectorKey: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.restaurantId, ["owner", "manager"]);
    const c = getConnector(data.connectorKey);
    try {
      const sample = c.normalize(c.mockPayload([]));
      return { ok: true, message: `Normalizer produced a valid order with ${sample.items.length} item(s).` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Validation failed" };
    }
  });

export const sourceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceId: uuid, action: z.enum(["pause", "resume", "disconnect", "reconnect"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const { data: src } = await a.from("order_sources").select("*").eq("id", data.sourceId).single();
    if (!src) throw new Error("Source not found");
    await requireRole(context, src.restaurant_id, data.action === "disconnect" ? ["owner"] : ["owner", "manager"]);
    if (src.connector_key === "manual" && data.action === "disconnect") throw new Error("Manual orders cannot be disconnected");
    const patch =
      data.action === "pause" ? { status: "paused" as const }
      : data.action === "resume" || data.action === "reconnect" ? { status: "connected" as const, health: "healthy", last_error: null }
      : { status: "not_connected" as const, health: "unknown", config: {} as never, connected_account: null };
    await a.from("order_sources").update(patch).eq("id", data.sourceId);
    if (data.action === "disconnect") await a.from("integration_credentials").delete().eq("source_id", data.sourceId);
    await audit(src.restaurant_id, context.userId, `source.${data.action}`, "order_source", src.id);
    return { ok: true };
  });

export const syncSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const { data: src } = await a.from("order_sources").select("*").eq("id", data.sourceId).single();
    if (!src) throw new Error("Source not found");
    await requireRole(context, src.restaurant_id, ["owner", "manager"]);
    if (src.status !== "connected") throw new Error("Source is not connected");
    if (src.last_sync_at && Date.now() - new Date(src.last_sync_at).getTime() < 5000) throw new Error("Please wait a few seconds between syncs");
    const { ingestOrder } = await import("./ingest.server");
    await a.from("order_sources").update({ status: "syncing" }).eq("id", src.id);
    const results = [];
    try {
      if (src.environment === "mock") {
        const { data: rest } = await a.from("restaurants").select("stations").eq("id", src.restaurant_id).single();
        const c = getConnector(src.connector_key);
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          results.push(await ingestOrder(a, { restaurantId: src.restaurant_id, sourceId: src.id, connectorKey: src.connector_key, raw: c.mockPayload(rest?.stations ?? []), actorId: context.userId }));
        }
      }
      // Production push connectors: sync = retry any failed jobs for this source.
      const { data: failed } = await a.from("ingestion_jobs").select("*").eq("source_id", src.id).eq("status", "failed").lt("attempts", 5).limit(20);
      for (const job of failed ?? []) {
        const r = await ingestOrder(a, { restaurantId: src.restaurant_id, sourceId: src.id, connectorKey: src.connector_key, raw: job.payload });
        await a.from("ingestion_jobs").update({ status: r.status === "failed" ? "failed" : "done", attempts: job.attempts + 1 }).eq("id", job.id);
        results.push(r);
      }
      const failures = results.filter((r) => r.status === "failed").length;
      await a.from("order_sources").update({
        status: "connected", last_sync_at: new Date().toISOString(), health: failures ? "degraded" : "healthy",
        last_error: failures ? `${failures} payload(s) failed validation` : null,
      }).eq("id", src.id);
    } catch (e) {
      await a.from("order_sources").update({ status: "error", health: "down", last_error: e instanceof Error ? e.message : "Sync failed" }).eq("id", src.id);
      throw e;
    }
    return {
      created: results.filter((r) => r.status === "created").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      failed: results.filter((r) => r.status === "failed").length,
    };
  });

/* ---------------- Orders ---------------- */

export const createManualOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restaurantId: uuid, order: unifiedOrderSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.restaurantId, ["owner", "manager"]);
    const a = await admin();
    const { data: src } = await a.from("order_sources").select("id").eq("restaurant_id", data.restaurantId).eq("connector_key", "manual").single();
    if (!src) throw new Error("Manual source missing");
    const { ingestOrder } = await import("./ingest.server");
    const r = await ingestOrder(a, { restaurantId: data.restaurantId, sourceId: src.id, connectorKey: "manual", raw: data.order, actorId: context.userId });
    if (r.status === "failed") throw new Error(r.error ?? "Could not create order");
    if (r.status === "duplicate") throw new Error("An order with this reference already exists");
    return r;
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    orderId: uuid,
    to: z.enum(["NEW", "ACCEPTED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REFUNDED", "FAILED"]),
    note: z.string().max(300).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const order = await loadOrder(data.orderId);
    await requireRole(context, order.restaurant_id, STATUS_ROLES[data.to] as Role[]);
    const from = order.status as OrderStatus;
    if (!ALLOWED[from].includes(data.to)) throw new Error(`Cannot move from ${from} to ${data.to}`);
    const a = await admin();
    const delivery_status = data.to === "OUT_FOR_DELIVERY" ? "OUT_FOR_DELIVERY" : data.to === "DELIVERED" ? "DELIVERED" : data.to === "READY" && from === "ASSIGNED" ? "UNASSIGNED" : undefined;
    await a.from("orders").update({ status: data.to, updated_at: new Date().toISOString(), ...(delivery_status ? { delivery_status } : {}) }).eq("id", order.id);
    await a.from("order_status_history").insert({ order_id: order.id, restaurant_id: order.restaurant_id, from_status: from, to_status: data.to, actor_id: context.userId, note: data.note ?? null });
    if (data.to === "OUT_FOR_DELIVERY") await a.from("deliveries").update({ status: "OUT_FOR_DELIVERY", picked_up_at: new Date().toISOString() }).eq("order_id", order.id);
    if (data.to === "DELIVERED") await a.from("deliveries").update({ status: "DELIVERED", delivered_at: new Date().toISOString() }).eq("order_id", order.id);
    if (["READY", "DELIVERED", "CANCELLED", "FAILED"].includes(data.to)) {
      await a.from("notifications").insert({
        restaurant_id: order.restaurant_id, category: data.to === "READY" ? "kitchen" : "delivery",
        title: `${order.order_number} is ${data.to.replace(/_/g, " ").toLowerCase()}`, link: `/orders/${order.id}`,
      });
    }
    await audit(order.restaurant_id, context.userId, "order.status", "order", order.id, { from, to: data.to });
    return { ok: true };
  });

/* ---------------- Delivery ---------------- */

export const assignDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: uuid, partnerId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const order = await loadOrder(data.orderId);
    await requireRole(context, order.restaurant_id, ["owner", "manager"]);
    if (!["READY", "ASSIGNED"].includes(order.status)) throw new Error("Only ready orders can be assigned");
    const a = await admin();
    const { data: partner } = await a.from("delivery_partners").select("*").eq("id", data.partnerId).eq("restaurant_id", order.restaurant_id).single();
    if (!partner || !partner.active) throw new Error("Delivery partner unavailable");
    await a.from("deliveries").upsert({ order_id: order.id, restaurant_id: order.restaurant_id, partner_id: partner.id, status: "ASSIGNED", assigned_at: new Date().toISOString() }, { onConflict: "order_id" });
    if (order.status !== "ASSIGNED") {
      await a.from("orders").update({ status: "ASSIGNED", delivery_status: "ASSIGNED", updated_at: new Date().toISOString() }).eq("id", order.id);
      await a.from("order_status_history").insert({ order_id: order.id, restaurant_id: order.restaurant_id, from_status: order.status, to_status: "ASSIGNED", actor_id: context.userId, note: `Assigned to ${partner.name}` });
    } else {
      await a.from("order_status_history").insert({ order_id: order.id, restaurant_id: order.restaurant_id, from_status: "ASSIGNED", to_status: "ASSIGNED", actor_id: context.userId, note: `Reassigned to ${partner.name}` });
    }
    return { ok: true };
  });

export const markPickedUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const order = await loadOrder(data.orderId);
    await requireRole(context, order.restaurant_id, ["owner", "manager", "delivery"]);
    const a = await admin();
    await a.from("deliveries").update({ status: "PICKED_UP", picked_up_at: new Date().toISOString() }).eq("order_id", order.id);
    await a.from("orders").update({ delivery_status: "PICKED_UP" }).eq("id", order.id);
    return { ok: true };
  });

/* ---------------- Payments / refunds / settlements ---------------- */

export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const order = await loadOrder(data.orderId);
    await requireRole(context, order.restaurant_id, ["owner", "manager"]);
    const a = await admin();
    const { data: src } = order.source_id ? await a.from("order_sources").select("environment").eq("id", order.source_id).single() : { data: null };
    // Server-side verification rules. COD: only after delivery (cash collected).
    // Online: production requires a payment-gateway lookup (not configured) — only test-mode orders auto-verify.
    if (order.payment_method === "COD" && order.status !== "DELIVERED") throw new Error("Cash can be confirmed only after delivery");
    if (order.payment_method !== "COD" && src?.environment !== "mock" && order.source_key !== "manual") {
      throw new Error("Online payments are verified from the platform's settlement data; no gateway is configured yet");
    }
    await a.from("payments").update({ status: "PAID", verified_at: new Date().toISOString(), provider_ref: `VER-${Date.now()}` }).eq("order_id", order.id);
    await a.from("orders").update({ payment_status: "PAID" }).eq("id", order.id);
    await a.from("notifications").insert({ restaurant_id: order.restaurant_id, category: "payment", title: `Payment verified for ${order.order_number}`, link: `/orders/${order.id}` });
    await audit(order.restaurant_id, context.userId, "payment.verified", "order", order.id);
    return { ok: true };
  });

export const refundOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: uuid, amount: z.number().positive(), reason: z.string().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const order = await loadOrder(data.orderId);
    await requireRole(context, order.restaurant_id, ["owner"]);
    if (data.amount > Number(order.total)) throw new Error("Refund exceeds order total");
    if (!ALLOWED[order.status as OrderStatus].includes("REFUNDED")) throw new Error("Order cannot be refunded in its current state");
    const a = await admin();
    await a.from("refunds").insert({ order_id: order.id, restaurant_id: order.restaurant_id, amount: data.amount, reason: data.reason });
    await a.from("orders").update({ status: "REFUNDED", payment_status: "REFUNDED" }).eq("id", order.id);
    await a.from("payments").update({ status: "REFUNDED" }).eq("order_id", order.id);
    await a.from("order_status_history").insert({ order_id: order.id, restaurant_id: order.restaurant_id, from_status: order.status, to_status: "REFUNDED", actor_id: context.userId, note: data.reason });
    await audit(order.restaurant_id, context.userId, "order.refunded", "order", order.id, { amount: data.amount });
    return { ok: true };
  });


export const runSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restaurantId: uuid, days: z.number().int().min(1).max(31).default(7) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.restaurantId, ["owner", "manager"]);
    const a = await admin();
    const end = new Date();
    const start = new Date(Date.now() - data.days * 86400_000);
    const { data: orders } = await a.from("orders").select("source_key,subtotal,discount,total,status")
      .eq("restaurant_id", data.restaurantId).gte("created_at", start.toISOString());
    const { data: refunds } = await a.from("refunds").select("amount, orders(source_key)").eq("restaurant_id", data.restaurantId).gte("created_at", start.toISOString());
    const by: Record<string, { gross: number; discounts: number; refunds: number }> = {};
    for (const o of orders ?? []) {
      if (["CANCELLED", "FAILED"].includes(o.status)) continue;
      const b = (by[o.source_key] ??= { gross: 0, discounts: 0, refunds: 0 });
      b.gross += Number(o.subtotal);
      b.discounts += Number(o.discount);
    }
    for (const r of refunds ?? []) {
      const k = (r.orders as { source_key: string } | null)?.source_key ?? "manual";
      (by[k] ??= { gross: 0, discounts: 0, refunds: 0 }).refunds += Number(r.amount);
    }
    const rows = Object.entries(by).map(([k, v]) => {
      const commission = 0; // Commission rates not configured yet
      return {
        restaurant_id: data.restaurantId, source_key: k, period_start: start.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10),
        gross: v.gross, discounts: v.discounts, commission, refunds: v.refunds, adjustments: 0, net: v.gross - v.discounts - commission - v.refunds, status: "COMPUTED",
      };
    });
    if (rows.length) await a.from("settlements").insert(rows);
    await audit(data.restaurantId, context.userId, "settlement.run", "settlement", data.restaurantId, { rows: rows.length });
    return { rows: rows.length };
  });

/* ---------------- Staff ---------------- */

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    restaurantId: uuid, email: z.string().email().max(200), name: z.string().min(2).max(80),
    role: z.enum(["manager", "kitchen", "delivery"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.restaurantId, ["owner"]);
    const a = await admin();
    const email = data.email.toLowerCase();
    const { data: profile } = await a.from("profiles").select("id").ilike("email", email).maybeSingle();
    const { error } = await a.from("restaurant_members").insert({
      restaurant_id: data.restaurantId, user_id: profile?.id ?? null, invited_email: email, display_name: data.name, role: data.role,
    });
    if (error) throw new Error(error.code === "23505" ? "This person is already on your team" : error.message);
    if (data.role === "delivery") {
      await a.from("delivery_partners").insert({ restaurant_id: data.restaurantId, user_id: profile?.id ?? null, name: data.name, phone: email });
    }
    await audit(data.restaurantId, context.userId, "staff.invited", "member", email, { role: data.role });
    return { linked: !!profile };
  });

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    memberId: uuid, role: z.enum(["manager", "kitchen", "delivery"]).optional(), active: z.boolean().optional(), remove: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const { data: m } = await a.from("restaurant_members").select("*").eq("id", data.memberId).single();
    if (!m) throw new Error("Member not found");
    await requireRole(context, m.restaurant_id, ["owner"]);
    if (m.role === "owner") throw new Error("The owner account cannot be changed here");
    if (data.remove) await a.from("restaurant_members").delete().eq("id", m.id);
    else await a.from("restaurant_members").update({ ...(data.role ? { role: data.role } : {}), ...(data.active !== undefined ? { active: data.active } : {}) }).eq("id", m.id);
    await audit(m.restaurant_id, context.userId, data.remove ? "staff.removed" : "staff.updated", "member", m.id, data);
    return { ok: true };
  });

/* ---------------- Platform admin ---------------- */

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_platform_admin");
    if (!isAdmin) return { allowed: false as const };
    const a = await admin();
    const [restaurants, members, orders, sources, audits, jobs] = await Promise.all([
      a.from("restaurants").select("id,name,email,phone,active,created_at").order("created_at", { ascending: false }).limit(200),
      a.from("restaurant_members").select("id,restaurant_id,display_name,invited_email,role,active,user_id").limit(500),
      a.from("orders").select("id,order_number,restaurant_id,source_key,customer_name,total,status,created_at").order("created_at", { ascending: false }).limit(200),
      a.from("order_sources").select("id,restaurant_id,display_name,connector_key,environment,status,health,last_sync_at,last_error,orders_received").limit(500),
      a.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
      a.from("ingestion_jobs").select("status").limit(5000),
    ]);
    return {
      allowed: true as const,
      restaurants: restaurants.data ?? [], members: members.data ?? [], orders: orders.data ?? [],
      sources: sources.data ?? [], audits: audits.data ?? [],
      jobs: (jobs.data ?? []).reduce<Record<string, number>>((m, j) => ((m[j.status] = (m[j.status] ?? 0) + 1), m), {}),
    };
  });

/* ---------------- Background retries ---------------- */

export const retryFailedJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restaurantId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.restaurantId, ["owner", "manager"]);
    const a = await admin();
    const { retryDueJobs } = await import("./ingest.server");
    return retryDueJobs(a, data.restaurantId);
  });
