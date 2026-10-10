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
      let sample; let via = "Normalizer";
      try { sample = c.normalize(c.mockPayload([])); }
      catch (e) {
        if (!c.aiFallback) throw e;
        const { aiNormalizeOrder } = await import("./ai-normalize.server");
        sample = await aiNormalizeOrder(c.mockPayload([]), c.name); via = "AI reader";
      }
      return { ok: true, message: `${via} produced a valid order with ${sample.items.length} item(s).` };
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

/** Saves or rotates a source's login (e.g. monthly IRCTC password change). Encrypted server-side; never returned to the browser. */
export const updateSourceCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    sourceId: uuid,
    account: z.string().trim().min(3).max(160),
    password: z.string().min(4).max(200),
    otp: z.string().trim().max(12).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const { data: src } = await a.from("order_sources").select("id,restaurant_id,connector_key").eq("id", data.sourceId).single();
    if (!src) throw new Error("Source not found");
    await requireRole(context, src.restaurant_id, ["owner", "manager"]);
    if (src.connector_key === "manual") throw new Error("Manual orders don't need a login");
    const keyHex = process.env["CREDENTIALS_ENCRYPTION_KEY"];
    if (!keyHex) throw new Error("Encryption key missing on server");
    const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(keyHex));
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify({ account: data.account, password: data.password, otp: data.otp || null, saved_at: new Date().toISOString() }));
    const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
    const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
    const ciphertext = `v1:${b64(iv)}:${b64(enc)}`;
    await a.from("integration_credentials").delete().eq("source_id", src.id);
    const { error } = await a.from("integration_credentials").insert({ source_id: src.id, ciphertext, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    const masked = data.account.includes("@") ? data.account.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : data.account.slice(0, 2) + "•••";
    await a.from("order_sources").update({ connected_account: masked, last_error: null }).eq("id", src.id);
    await audit(src.restaurant_id, context.userId, "source.credentials_updated", "order_source", src.id);
    return { ok: true, account: masked };
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
      const { retryDueJobs } = await import("./ingest.server");
      const retried = await retryDueJobs(a, src.restaurant_id, src.id);
      if (retried.checked > retried.recovered) results.push({ status: "failed" as const });
      const failures = results.filter((r) => r.status === "failed" || r.status === "needs_review").length;
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

/* ---------------- Menu ---------------- */

export const saveMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    restaurantId: uuid,
    itemId: uuid.optional(),
    name: z.string().trim().min(2).max(120),
    category: z.string().trim().max(60).optional(),
    price: z.number().min(0).max(100000),
    available: z.boolean().default(true),
    notes: z.string().trim().max(300).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.restaurantId, ["owner", "manager"]);
    const a = await admin();
    const row = {
      restaurant_id: data.restaurantId, name: data.name, category: data.category || null,
      price: data.price, available: data.available, notes: data.notes || null, updated_at: new Date().toISOString(),
    };
    const { data: item, error } = data.itemId
      ? await a.from("menu_items").update(row).eq("id", data.itemId).eq("restaurant_id", data.restaurantId).select("id").single()
      : await a.from("menu_items").insert(row).select("id").single();
    if (error) throw new Error(error.code === "23505" ? "An item with this name already exists" : error.message);
    await audit(data.restaurantId, context.userId, data.itemId ? "menu.updated" : "menu.created", "menu_item", item.id, { name: data.name });
    return { id: item.id };
  });

export const setMenuItemAvailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ itemId: uuid, available: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const { data: item } = await a.from("menu_items").select("id,restaurant_id,name").eq("id", data.itemId).single();
    if (!item) throw new Error("Item not found");
    await requireRole(context, item.restaurant_id, ["owner", "manager"]);
    await a.from("menu_items").update({ available: data.available, updated_at: new Date().toISOString() }).eq("id", item.id);
    await audit(item.restaurant_id, context.userId, data.available ? "menu.available" : "menu.unavailable", "menu_item", item.id, { name: item.name });
    return { ok: true };
  });

export const deleteMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ itemId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const { data: item } = await a.from("menu_items").select("id,restaurant_id,name").eq("id", data.itemId).single();
    if (!item) throw new Error("Item not found");
    await requireRole(context, item.restaurant_id, ["owner"]);
    await a.from("menu_items").delete().eq("id", item.id);
    await audit(item.restaurant_id, context.userId, "menu.deleted", "menu_item", item.id, { name: item.name });
    return { ok: true };
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

/* ---------------- Import problems: retry / dismiss one job ---------------- */
async function loadJob(id: string) {
  const a = await admin();
  const { data } = await a.from("ingestion_jobs").select("id, restaurant_id, status").eq("id", id).single();
  if (!data) throw new Error("Import not found");
  return data;
}
export const retryIngestionJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ jobId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const job = await loadJob(data.jobId);
    await requireRole(context, job.restaurant_id, ["owner", "manager"]);
    if (["done", "duplicate", "superseded", "processing"].includes(job.status)) throw new Error(`Cannot retry an import that is ${job.status}`);
    const { retryJob } = await import("./ingest.server");
    const r = await retryJob(await admin(), job.id);
    await audit(job.restaurant_id, context.userId, "ingestion.retry", "ingestion_job", job.id, { result: r.status, code: r.errorCode ?? null });
    return { status: r.status, error: r.error ?? null, errorCode: r.errorCode ?? null, orderId: r.orderId ?? null };
  });
export const dismissIngestionJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ jobId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const job = await loadJob(data.jobId);
    await requireRole(context, job.restaurant_id, ["owner", "manager"]);
    if (!["failed", "needs_review", "dead_letter"].includes(job.status)) throw new Error(`Cannot dismiss an import that is ${job.status}`);
    const a = await admin();
    await a.from("ingestion_jobs").update({ status: "dismissed", updated_at: new Date().toISOString() }).eq("id", job.id);
    await audit(job.restaurant_id, context.userId, "ingestion.dismiss", "ingestion_job", job.id);
    return { ok: true };
  });
