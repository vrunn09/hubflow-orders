import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { usePartners } from "@/lib/queries";
import { assignDelivery, refundOrder, updateOrderStatus, verifyPayment } from "@/lib/api.functions";
import { ALLOWED, STATUS_LABEL, STATUS_ROLES, formatINR, type OrderStatus } from "@/lib/order-status";
import { ErrorState, TableSkeleton } from "@/components/app/states";
import { Pill, SourceTag } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/_app/orders/$id")({
  head: () => ({ meta: [{ title: "Order details — RailFeasto Order Hub" }, { name: "description", content: "Order details and timeline." }, { property: "og:title", content: "Order details" }, { property: "og:description", content: "Order details and timeline." }] }),
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const { restaurantId, role, can } = useTenant();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, order_items(*), order_status_history(*), deliveries(*, delivery_partners(name, phone))").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const partners = usePartners(can("owner", "manager") ? restaurantId : "");
  const setStatus = useServerFn(updateOrderStatus);
  const assign = useServerFn(assignDelivery);
  const verify = useServerFn(verifyPayment);
  const refund = useServerFn(refundOrder);
  const [confirm, setConfirm] = useState<OrderStatus | null>(null);
  const [refundAmt, setRefundAmt] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: ["order", id] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
    setBusy(false);
  };

  if (q.isLoading) return <TableSkeleton />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const o = q.data;
  if (!o) return <ErrorState error={new Error("Order not found or you don't have access.")} />;
  const status = o.status as OrderStatus;
  const next = ALLOWED[status].filter((s) => s !== "REFUNDED" && s !== "ASSIGNED" && STATUS_ROLES[s].includes(role));
  const delivery = o.deliveries?.[0] ?? (o.deliveries as unknown as { partner_id: string; delivery_partners: { name: string } } | null);
  const history = [...(o.order_status_history ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const fin = can("owner", "manager");

  return (
    <div>
      <Link to="/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Orders</Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold">{o.order_number}</h1>
        <Pill value={o.status} /><SourceTag k={o.source_key} />
        <span className="text-xs text-muted-foreground">External: {o.external_order_id}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {next.map((s) => (
            <Button key={s} size="sm" variant={s === "CANCELLED" || s === "FAILED" ? "outline" : "saffron"} disabled={busy}
              onClick={() => (s === "CANCELLED" || s === "FAILED" ? setConfirm(s) : run(() => setStatus({ data: { orderId: o.id, to: s } }), `Marked ${STATUS_LABEL[s]}`))}>
              {s === "CANCELLED" ? "Cancel order" : `Mark ${STATUS_LABEL[s]}`}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Items">
            <table className="w-full text-sm"><tbody className="divide-y">
              {o.order_items.map((i) => <tr key={i.id}><td className="py-2"><span className="tabular font-semibold">{i.quantity}×</span> {i.name}{i.notes && <div className="text-xs text-muted-foreground">{i.notes}</div>}</td><td className="tabular py-2 text-right">{fin ? formatINR(Number(i.unit_price) * i.quantity) : ""}</td></tr>)}
            </tbody></table>
            {fin && (
              <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
                {[["Subtotal", o.subtotal], ["Tax", o.tax], ["Delivery fee", o.delivery_fee], ["Discount", -Number(o.discount)]].map(([l, v]) => <div key={l as string} className="flex justify-between text-muted-foreground"><dt>{l}</dt><dd className="tabular">{formatINR(v as number)}</dd></div>)}
                <div className="flex justify-between font-bold"><dt>Total</dt><dd className="tabular">{formatINR(o.total)}</dd></div>
              </dl>
            )}
          </Card>
          <Card title="Timeline">
            <ol className="relative space-y-4 border-l pl-5">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-card bg-saffron" />
                  <div className="text-sm font-medium">{STATUS_LABEL[h.to_status as OrderStatus]}{h.from_status && <span className="text-muted-foreground"> from {STATUS_LABEL[h.from_status as OrderStatus]}</span>}</div>
                  <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("en-IN")}{h.note && ` · ${h.note}`}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Customer & journey">
            <Dl rows={[["Customer", o.customer_name], ["Phone", fin ? o.customer_phone : "Hidden"], ["Train", o.train_number && `${o.train_number} ${o.train_name ?? ""}`], ["Journey date", o.journey_date], ["Station", o.delivery_station], ["Coach / seat", o.coach && `${o.coach} / ${o.seat ?? "—"}`], ["Deliver by", o.deliver_by && new Date(o.deliver_by).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })], ["Instructions", o.instructions]]} />
          </Card>
          <Card title="Delivery">
            <Dl rows={[["Status", o.delivery_status.replace(/_/g, " ")], ["Partner", delivery?.delivery_partners?.name ?? "Unassigned"]]} />
            {fin && ["READY", "ASSIGNED"].includes(o.status) && (
              <select className="mt-3 h-9 w-full rounded-md border bg-background px-2 text-sm" value="" disabled={busy}
                onChange={(e) => e.target.value && run(() => assign({ data: { orderId: o.id, partnerId: e.target.value } }), "Delivery partner assigned")}>
                <option value="">{delivery ? "Reassign to…" : "Assign partner…"}</option>
                {(partners.data ?? []).filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}{p.available ? "" : " (busy)"}</option>)}
              </select>
            )}
          </Card>
          {fin && (
            <Card title="Payment">
              <Dl rows={[["Method", o.payment_method], ["Status", <Pill key="p" value={o.payment_status} />]]} />
              {o.payment_status === "PENDING" && <Button size="sm" variant="outline" className="mt-3 w-full" disabled={busy} onClick={() => run(() => verify({ data: { orderId: o.id } }), "Payment verified")}>Verify payment</Button>}
              {can("owner") && ALLOWED[status].includes("REFUNDED") && o.payment_status === "PAID" && (
                <div className="mt-3 flex gap-2"><Input type="number" placeholder="Refund ₹" value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} />
                  <Button size="sm" variant="destructive" disabled={busy || !+refundAmt} onClick={() => run(() => refund({ data: { orderId: o.id, amount: +refundAmt, reason: "Refund issued by owner" } }), "Refund recorded")}>Refund</Button></div>
              )}
            </Card>
          )}
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{confirm === "CANCELLED" ? "Cancel this order?" : "Mark delivery as failed?"}</AlertDialogTitle>
            <AlertDialogDescription>This is recorded in the order timeline and can't be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && run(() => setStatus({ data: { orderId: o.id, to: confirm } }), "Order updated")}>Confirm</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="surface p-4"><h2 className="mb-3 text-sm font-semibold">{title}</h2>{children}</section>;
}
function Dl({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl className="space-y-1.5 text-sm">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v || "—"}</dd></div>)}</dl>;
}
