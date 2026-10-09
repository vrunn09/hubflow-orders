import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { formatINR } from "@/lib/order-status";
import { downloadCsv } from "@/lib/queries";
import { platformName } from "@/lib/print-bill";
import { RoleGuard } from "@/components/app/Guard";
import { CardsSkeleton, EmptyState, ErrorState, PageHeader, StatCard, TableSkeleton } from "@/components/app/states";
import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/payments")({
  head: () => ({ meta: [{ title: "Payments & COD — RailFeasto Order Hub" }, { name: "description", content: "Transactions, cash ledger and refunds." }, { property: "og:title", content: "Payments & COD" }, { property: "og:description", content: "Transactions, cash ledger and refunds." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Payments /></RoleGuard>,
});

const TABS = ["All", "Online", "Offline", "Pending", "Failed", "Refunds", "COD Ledger"] as const;
const RANGES = [{ k: "1", t: "Today" }, { k: "7", t: "7 days" }, { k: "30", t: "30 days" }] as const;

function Payments() {
  const { restaurantId } = useTenant();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [days, setDays] = useState<(typeof RANGES)[number]["k"]>("30");

  const q = useQuery({
    queryKey: ["payments", restaurantId, days],
    queryFn: async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (Number(days) - 1));
      const [p, r, cod] = await Promise.all([
        supabase.from("payments").select("*, orders(order_number, customer_name, source_key)").eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(1000),
        supabase.from("refunds").select("*, orders(order_number, customer_name)").eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
        supabase.from("orders").select("id, order_number, customer_name, customer_phone, train_number, delivery_station, total, payment_status, status, created_at, deliver_by, source_platform, source_key, deliveries(status, delivery_partners(name))")
          .eq("restaurant_id", restaurantId).eq("payment_method", "COD").gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(1000),
      ]);
      if (p.error) throw p.error;
      return { payments: p.data, refunds: r.data ?? [], cod: cod.data ?? [] };
    },
  });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const p = q.data?.payments ?? [];
  const cod = q.data?.cod ?? [];
  const sum = (rows: typeof p) => rows.reduce((s, x) => s + Number(x.amount), 0);
  const list = tab === "Online" ? p.filter((x) => x.mode === "online") : tab === "Offline" ? p.filter((x) => x.mode === "offline") : tab === "Pending" ? p.filter((x) => x.status === "PENDING") : tab === "Failed" ? p.filter((x) => x.status === "FAILED") : p;

  const codLive = cod.filter((o) => !["CANCELLED", "FAILED"].includes(o.status));
  const codCollected = codLive.filter((o) => o.payment_status === "PAID");
  const codDue = codLive.filter((o) => o.payment_status !== "PAID");
  const codTotal = (rows: typeof cod) => rows.reduce((s, o) => s + Number(o.total), 0);
  const execOf = (o: typeof cod[number]) => (o.deliveries as { delivery_partners: { name: string } | null }[] | null)?.[0]?.delivery_partners?.name ?? "—";

  return (
    <div>
      <PageHeader title="Payments & COD" description="Payment status is set only by server-side verification. Cash is tracked separately from platform totals."
        actions={
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {RANGES.map((r) => <button key={r.k} onClick={() => setDays(r.k)} className={cn("rounded px-2.5 py-1 text-xs", days === r.k ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{r.t}</button>)}
          </div>
        } />
      {q.isLoading ? <CardsSkeleton /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Collected" value={formatINR(sum(p.filter((x) => x.status === "PAID")))} accent />
          <StatCard label="Online" value={formatINR(sum(p.filter((x) => x.mode === "online" && x.status === "PAID")))} />
          <StatCard label="Cash collected" value={formatINR(codTotal(codCollected))} hint={`${codCollected.length} COD orders`} />
          <StatCard label="Cash to collect" value={formatINR(codTotal(codDue))} hint={`${codDue.length} pending`} />
          <StatCard label="Refunded" value={formatINR((q.data?.refunds ?? []).reduce((s, r) => s + Number(r.amount), 0))} />
        </div>
      )}
      <div className="mb-3 mt-6 flex flex-wrap gap-1">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{t}</button>)}</div>

      {q.isLoading ? <TableSkeleton /> : tab === "COD Ledger" ? (
        !cod.length ? <EmptyState title="No cash orders" body="Cash-on-delivery orders for this period will appear here." /> : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Cash handed over by executives must match this ledger.</p>
              <Button size="sm" variant="outline" onClick={() => downloadCsv(`cod-ledger-${new Date().toISOString().slice(0, 10)}.csv`, cod.map((o) => ({
                order: o.order_number, platform: platformName(o.source_platform ?? o.source_key), customer: o.customer_name, phone: o.customer_phone,
                train: o.train_number ?? "", station: o.delivery_station ?? "", executive: execOf(o), amount: Number(o.total),
                collected: o.payment_status === "PAID" ? "YES" : "NO", order_status: o.status, placed: o.created_at,
              })))}><Download />CSV</Button>
            </div>
            <div className="surface overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="hidden px-3 py-2 sm:table-cell">Train / Station</th><th className="px-3 py-2">Executive</th><th className="px-3 py-2 text-right">To collect</th><th className="px-3 py-2">Cash</th></tr></thead>
              <tbody className="divide-y">{cod.map((o) => (
                <tr key={o.id} className={cn(o.payment_status !== "PAID" && !["CANCELLED", "FAILED"].includes(o.status) && "bg-warning-soft/40")}>
                  <td className="px-3 py-2"><Link to="/orders/$id" params={{ id: o.id }} className="font-mono text-xs font-semibold">{o.order_number}</Link></td>
                  <td className="px-3 py-2">{o.customer_name}<div className="text-xs text-muted-foreground">{o.customer_phone}</div></td>
                  <td className="hidden px-3 py-2 text-xs sm:table-cell">{o.train_number ?? "—"}{o.delivery_station ? ` · ${o.delivery_station}` : ""}</td>
                  <td className="px-3 py-2 text-xs">{execOf(o)}</td>
                  <td className="tabular px-3 py-2 text-right font-semibold">{formatINR(o.total)}</td>
                  <td className="px-3 py-2"><Pill value={o.payment_status} label={o.payment_status === "PAID" ? "Collected" : o.payment_status === "REFUNDED" ? "Refunded" : "To collect"} /></td>
                </tr>))}</tbody>
              <tfoot className="border-t bg-muted/40 text-sm font-bold"><tr><td className="px-3 py-2" colSpan={4}>Cash due from executives</td><td className="tabular px-3 py-2 text-right">{formatINR(codTotal(codDue))}</td><td className="px-3 py-2 text-xs font-medium text-muted-foreground">{codDue.length} orders</td></tr></tfoot>
            </table></div>
          </>
        )
      ) : tab === "Refunds" ? (
        !q.data?.refunds.length ? <EmptyState title="No refunds" /> : (
          <div className="surface divide-y text-sm">{q.data.refunds.map((r) => <div key={r.id} className="flex gap-3 px-4 py-2.5"><span className="font-mono text-xs">{(r.orders as { order_number: string } | null)?.order_number}</span><span className="flex-1">{r.reason}</span><span className="tabular font-semibold">{formatINR(r.amount)}</span></div>)}</div>
        )
      ) : !list.length ? <EmptyState title="No transactions" /> : (
        <div className="surface overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Method</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="hidden px-3 py-2 sm:table-cell">Verified</th></tr></thead>
          <tbody className="divide-y">{list.map((x) => { const o = x.orders as { order_number: string; customer_name: string } | null; return (
            <tr key={x.id}><td className="px-3 py-2"><Link to="/orders/$id" params={{ id: x.order_id }} className="font-mono text-xs font-semibold">{o?.order_number}</Link></td><td className="px-3 py-2">{o?.customer_name}</td><td className="px-3 py-2 text-xs">{x.method} · {x.mode}</td><td className="tabular px-3 py-2 text-right font-semibold">{formatINR(x.amount)}</td><td className="px-3 py-2"><Pill value={x.status} /></td><td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">{x.verified_at ? new Date(x.verified_at).toLocaleString("en-IN") : "—"}</td></tr>); })}</tbody>
        </table></div>
      )}
    </div>
  );
}
