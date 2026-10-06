import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getConnector } from "./connectors/registry";

type Admin = SupabaseClient<Database>;

export interface IngestResult {
  status: "created" | "duplicate" | "failed";
  orderId?: string;
  error?: string;
}

/**
 * Central order ingestion pipeline.
 * Connector → Receive → Validate → Normalize → Duplicate check → Save → Status event → Realtime (via DB) → Notify.
 * Every payload is first persisted as an ingestion job so a failure is never silently lost.
 */
export async function ingestOrder(
  admin: Admin,
  args: { restaurantId: string; sourceId: string; connectorKey: string; raw: unknown; actorId?: string | null },
): Promise<IngestResult> {
  const { data: job, error: jobErr } = await admin
    .from("ingestion_jobs")
    .insert({ restaurant_id: args.restaurantId, source_id: args.sourceId, payload: args.raw as never, status: "processing", attempts: 1 })
    .select("id")
    .single();
  if (jobErr) throw jobErr;
  const finish = (status: "done" | "failed" | "duplicate", last_error?: string) =>
    admin.from("ingestion_jobs").update({
      status, last_error: last_error ?? null, updated_at: new Date().toISOString(),
      ...(status === "failed" ? { next_attempt_at: new Date(Date.now() + 60_000).toISOString() } : {}),
    }).eq("id", job.id);

  try {
    const order = getConnector(args.connectorKey).normalize(args.raw);
    const subtotal = order.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const total = Math.max(0, subtotal + order.tax + order.delivery_fee - order.discount);

    // Duplicate detection: restaurant + source + external id (also enforced by a unique index).
    const { data: existing } = await admin.from("orders").select("id")
      .eq("restaurant_id", args.restaurantId).eq("source_key", args.connectorKey).eq("external_order_id", order.external_order_id)
      .maybeSingle();
    if (existing) {
      await finish("duplicate");
      return { status: "duplicate", orderId: existing.id };
    }

    const { data: created, error } = await admin.from("orders").insert({
      restaurant_id: args.restaurantId, source_id: args.sourceId, source_key: args.connectorKey,
      external_order_id: order.external_order_id, customer_name: order.customer_name, customer_phone: order.customer_phone ?? null,
      train_number: order.train_number ?? null, train_name: order.train_name ?? null, journey_date: order.journey_date ?? null,
      delivery_station: order.delivery_station ?? null, coach: order.coach ?? null, seat: order.seat ?? null,
      instructions: order.instructions ?? null, subtotal, tax: order.tax, discount: order.discount,
      delivery_fee: order.delivery_fee, total, payment_method: order.payment_method,
      payment_status: "PENDING", priority: order.priority, deliver_by: order.deliver_by ?? null, raw_payload: args.raw as never,
    }).select("id, order_number").single();
    if (error) {
      if (error.code === "23505") { await finish("duplicate"); return { status: "duplicate" }; }
      throw error;
    }

    await admin.from("order_items").insert(order.items.map((i) => ({
      order_id: created.id, restaurant_id: args.restaurantId, name: i.name, quantity: i.quantity, unit_price: i.unit_price, notes: i.notes ?? null,
    })));
    await admin.from("order_status_history").insert({
      order_id: created.id, restaurant_id: args.restaurantId, to_status: "NEW", actor_id: args.actorId ?? null, note: `Received via ${args.connectorKey}`,
    });
    // Payment record starts PENDING; only server-side verification can mark it PAID.
    await admin.from("payments").insert({
      order_id: created.id, restaurant_id: args.restaurantId, method: order.payment_method,
      mode: order.payment_method === "COD" ? "offline" : "online", amount: total, status: "PENDING",
    });
    const { data: src } = await admin.from("order_sources").select("orders_received").eq("id", args.sourceId).single();
    await admin.from("order_sources").update({ orders_received: (src?.orders_received ?? 0) + 1 }).eq("id", args.sourceId);
    await admin.from("notifications").insert({
      restaurant_id: args.restaurantId, category: "order", title: `New order ${created.order_number}`,
      body: `${order.customer_name} · ${order.items.length} item(s) · ₹${total}`, link: `/orders/${created.id}`,
    });
    await finish("done");
    return { status: "created", orderId: created.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish("failed", msg.slice(0, 500));
    await admin.from("notifications").insert({
      restaurant_id: args.restaurantId, category: "integration", title: "Order ingestion failed",
      body: `A ${args.connectorKey} payload could not be processed and is queued for retry.`,
    });
    return { status: "failed", error: msg };
  }
}

export async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
