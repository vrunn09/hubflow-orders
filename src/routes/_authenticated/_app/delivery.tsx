import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MapPin, Phone } from "lucide-react";
import { useTenant } from "@/lib/tenant";
import { useActiveOrdersWithItems, usePartners } from "@/lib/queries";
import { assignDelivery, markPickedUp, updateOrderStatus } from "@/lib/api.functions";
import { RoleGuard } from "@/components/app/Guard";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { SourceTag } from "@/components/app/badges";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_app/delivery")({
  head: () => ({ meta: [{ title: "Delivery — RailFeasto Order Hub" }, { name: "description", content: "Delivery management and assignments." }, { property: "og:title", content: "Delivery" }, { property: "og:description", content: "Delivery management and assignments." }] }),
  component: () => <RoleGuard roles={["owner", "manager", "delivery"]}><Delivery /></RoleGuard>,
});

type Row = NonNullable<ReturnType<typeof useActiveOrdersWithItems>["data"]>[number];
const lane = (o: Row) => o.status === "READY" ? "Unassigned" : o.status === "OUT_FOR_DELIVERY" ? "Out for delivery" : o.status === "DELIVERED" ? "Delivered" : o.delivery_status === "PICKED_UP" ? "Picked up" : "Assigned";
const LANES = ["Unassigned", "Assigned", "Picked up", "Out for delivery", "Delivered"];

function Delivery() {
  const { restaurantId, role } = useTenant();
  const q = useActiveOrdersWithItems(restaurantId, ["READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"]);
  const isStaff = role === "delivery";
  const partners = usePartners(isStaff ? "" : restaurantId);
  const assign = useServerFn(assignDelivery);
  const pick = useServerFn(markPickedUp);
  const set = useServerFn(updateOrderStatus);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id); try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: ["orders"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } setBusy(null);
  };

  if (q.isLoading) return <TableSkeleton />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const today = new Date().toISOString().slice(0, 10);
  const rows = (q.data ?? []).filter((o) => o.status !== "DELIVERED" || o.created_at.slice(0, 10) === today);

  const actions = (o: Row) => {
    const d = Array.isArray(o.deliveries) ? o.deliveries[0] : o.deliveries;
    return (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {!isStaff && (o.status === "READY" || o.status === "ASSIGNED") && (
          <select className="h-8 flex-1 rounded-md border bg-background px-2 text-xs" value="" disabled={busy === o.id}
            onChange={(e) => e.target.value && run(o.id, () => assign({ data: { orderId: o.id, partnerId: e.target.value } }), "Assigned")}>
            <option value="">{d ? `Reassign (${d.delivery_partners?.name})` : "Assign partner…"}</option>
            {(partners.data ?? []).filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}{p.available ? "" : " · busy"}</option>)}
          </select>
        )}
        {o.status === "ASSIGNED" && o.delivery_status !== "PICKED_UP" && <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => run(o.id, () => pick({ data: { orderId: o.id } }), "Picked up")}>Picked up</Button>}
        {o.status === "ASSIGNED" && <Button size="sm" disabled={busy === o.id} onClick={() => run(o.id, () => set({ data: { orderId: o.id, to: "OUT_FOR_DELIVERY" } }), "Out for delivery")}>Out for delivery</Button>}
        {o.status === "OUT_FOR_DELIVERY" && <><Button size="sm" variant="saffron" disabled={busy === o.id} onClick={() => run(o.id, () => set({ data: { orderId: o.id, to: "DELIVERED" } }), "Delivered")}>Delivered</Button>
          <Button size="sm" variant="ghost" disabled={busy === o.id} onClick={() => run(o.id, () => set({ data: { orderId: o.id, to: "FAILED", note: "Delivery failed" } }), "Marked failed")}>Failed</Button></>}
      </div>
    );
  };

  const card = (o: Row) => (
    <article key={o.id} className="surface p-3">
      <div className="flex items-center gap-2"><Link to="/orders/$id" params={{ id: o.id }} className="font-mono text-sm font-bold">{o.order_number}</Link><SourceTag k={o.source_key} /></div>
      <div className="mt-2 text-sm font-semibold">{o.train_number ? `${o.train_number} ${o.train_name ?? ""}` : o.customer_name}</div>
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {o.delivery_station && <div className="flex items-center gap-1"><MapPin className="size-3" />{o.delivery_station}{o.coach && ` · Coach ${o.coach} · Seat ${o.seat ?? "—"}`}</div>}
        <div>{o.customer_name}{o.customer_phone && <a href={`tel:${o.customer_phone}`} className="ml-2 inline-flex items-center gap-0.5 text-info"><Phone className="size-3" />Call</a>}</div>
        {o.instructions && <div className="text-foreground">“{o.instructions}”</div>}
        <div>{o.order_items.reduce((s, i) => s + i.quantity, 0)} item(s){o.deliver_by && ` · by ${new Date(o.deliver_by).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}</div>
      </div>
      {actions(o)}
    </article>
  );

  if (isStaff) {
    const mine = rows.filter((o) => o.status !== "DELIVERED");
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="My deliveries" description="Orders assigned to you." />
        {!mine.length ? <EmptyState title="No active deliveries" body="New assignments will appear here automatically." /> : <div className="space-y-3">{mine.map(card)}</div>}
      </div>
    );
  }
  return (
    <div>
      <PageHeader title="Delivery" description="Assign, track and hand off orders to the berth." actions={<Button variant="outline" asChild><Link to="/delivery-partners">Partners</Link></Button>} />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {LANES.map((l) => {
          const list = rows.filter((o) => lane(o) === l);
          return (
            <section key={l} className="rounded-lg bg-muted/60 p-2">
              <h2 className="flex justify-between px-1.5 pb-2 text-sm font-bold">{l}<span className="tabular text-xs">{list.length}</span></h2>
              <div className="space-y-2">{list.length ? list.map(card) : <p className="py-6 text-center text-xs text-muted-foreground">Empty</p>}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
