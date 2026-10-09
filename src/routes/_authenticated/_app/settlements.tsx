import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { runSettlement } from "@/lib/api.functions";
import { formatINR } from "@/lib/order-status";
import { downloadCsv } from "@/lib/queries";
import { platformName } from "@/lib/print-bill";
import { RoleGuard } from "@/components/app/Guard";
import { EmptyState, ErrorState, PageHeader, StatCard, TableSkeleton } from "@/components/app/states";
import { SourceTag } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/settlements")({
  head: () => ({ meta: [{ title: "Reconciliation — RailFeasto Order Hub" }, { name: "description", content: "Match platform totals against cash and online collections." }, { property: "og:title", content: "Reconciliation" }, { property: "og:description", content: "Match platform totals against cash and online collections." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Reconcile /></RoleGuard>,
});

const RANGES = [{ k: "1", t: "Today" }, { k: "7", t: "7 days" }, { k: "30", t: "30 days" }] as const;

function Reconcile() {
  const { restaurantId } = useTenant();
  const run = useServerFn(runSettlement);
  const [tab, setTab] = useState<"recon" | "settlement">("recon");
  const [days, setDays] = useState<(typeof RANGES)[number]["k"]>("7");
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["reconcile", restaurantId, days],
    queryFn: async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (Number(days) - 1));
      const [orders, payments, refunds, settlements] = await Promise.all([
        supabase.from("orders").select("id, order_number, source_key, source_platform, total, subtotal, discount, status, payment_method, payment_status, created_at").eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).limit(2000),
        supabase.from("payments").select("order_id, amount, status, mode, method").eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).limit(2000),
        supabase.from("refunds").select("order_id, amount").eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).limit(2000),
        supabase.from("settlements").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(200),
      ]);
      if (orders.error) throw orders.error;
      return { orders: orders.data ?? [], payments: payments.data ?? [], refunds: refunds.data ?? [], settlements: settlements.data ?? [] };
    },
  });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const rows = q.data?.orders ?? [];
  const pays = q.data?.payments ?? [];
  const refs = q.data?.refunds ?? [];
  const keyOf = (r: { source_key: string; source_platform: string | null }) => platformName(r.source_platform ?? r.source_key);
  const billed = rows.filter((o) => !["CANCELLED", "FAILED"].includes(o.status));
  const paidOf = (ids: Set<string>) => pays.filter((p) => p.status === "PAID" && ids.has(p.order_id)).reduce((s, p) => s + Number(p.amount), 0);
  const refundedOf = (ids: Set<string>) => refs.filter((r) => ids.has(r.order_id)).reduce((s, r) => s + Number(r.amount), 0);

  const byPlat = Object.values(billed.reduce<Record<string, { plat: string; orders: number; billed: number; collected: number; cash: number; online: number; refunded: number }>>((m, o) => {
    const k = keyOf(o);
    const b = (m[k] ??= { plat: k, orders: 0, billed: 0, collected: 0, cash: 0, online: 0, refunded: 0 });
    b.orders++; b.billed += Number(o.total);
    return m;
  }, {})).map((b) => {
    const ids = new Set(billed.filter((o) => keyOf(o) === b.plat).map((o) => o.id));
    const paid = pays.filter((p) => p.status === "PAID" && ids.has(p.order_id));
    b.collected = paid.reduce((s, p) => s + Number(p.amount), 0);
    b.cash = paid.filter((p) => p.method === "COD" || p.mode === "offline").reduce((s, p) => s + Number(p.amount), 0);
    b.online = b.collected - b.cash;
    b.refunded = refundedOf(ids);
    return b;
  });
  const gap = (b: { billed: number; collected: number; refunded: number }) => b.billed - b.collected - b.refunded;
  const tot = {
    billed: byPlat.reduce((s, b) => s + b.billed, 0), collected: byPlat.reduce((s, b) => s + b.collected, 0),
    cash: byPlat.reduce((s, b) => s + b.cash, 0), online: byPlat.reduce((s, b) => s + b.online, 0),
    refunded: byPlat.reduce((s, b) => s + b.refunded, 0), orders: byPlat.reduce((s, b) => s + b.orders, 0),
  };
  const unsettled = rows.filter((o) => !["CANCELLED", "FAILED"].includes(o.status) && o.payment_status !== "PAID" && o.payment_status !== "REFUNDED");

  const st = q.data?.settlements ?? [];
  const stTotal = (k: "gross" | "discounts" | "commission" | "refunds" | "adjustments" | "net") => st.reduce((s, r) => s + Number(r[k]), 0);

  return (
    <div>
      <PageHeader title="Reconciliation" description="What the platforms billed against what was actually collected. Commission is not applied."
        actions={<><div className="flex items-center gap-1 rounded-md border p-0.5">{RANGES.map((r) => <button key={r.k} onClick={() => setDays(r.k)} className={cn("rounded px-2.5 py-1 text-xs", days === r.k ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{r.t}</button>)}</div>
          <Button variant="saffron" disabled={busy} onClick={async () => { setBusy(true); try { const r = await run({ data: { restaurantId, days: Number(days) } }); toast.success(`Computed ${r.rows} settlement line(s)`); q.refetch(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } setBusy(false); }}>{busy ? "Processing…" : "Run settlement"}</Button></>} />
      <div className="mb-4 flex gap-1">{(["recon", "settlement"] as const).map((v) => <button key={v} onClick={() => setTab(v)} className={cn("rounded-md px-3 py-1.5 text-sm", tab === v ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{v === "recon" ? "Collections vs billed" : "Settlement lines"}</button>)}</div>

      {q.isLoading ? <TableSkeleton /> : tab === "recon" ? (
        !rows.length ? <EmptyState title="Nothing to reconcile" body="No orders in this period yet." /> : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard label="Billed" value={formatINR(tot.billed)} hint={`${tot.orders} orders`} />
              <StatCard label="Collected" value={formatINR(tot.collected)} accent />
              <StatCard label="Cash" value={formatINR(tot.cash)} />
              <StatCard label="Online" value={formatINR(tot.online)} />
              <StatCard label="Not collected" value={formatINR(tot.billed - tot.collected - tot.refunded)} hint={`${unsettled.length} orders`} />
            </div>
            <div className="mb-2 mt-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Platform-wise reconciliation</h2>
              <Button size="sm" variant="outline" onClick={() => downloadCsv(`reconciliation-${days}d-${new Date().toISOString().slice(0, 10)}.csv`, byPlat.map((b) => ({
                platform: b.plat, orders: b.orders, billed: b.billed, cash_collected: b.cash, online_collected: b.online, collected: b.collected, refunded: b.refunded, difference: gap(b),
              })))}><Download />CSV</Button>
            </div>
            <div className="surface overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Platform</th><th className="px-3 py-2 text-right">Orders</th><th className="px-3 py-2 text-right">Billed</th><th className="px-3 py-2 text-right">Cash</th><th className="px-3 py-2 text-right">Online</th><th className="px-3 py-2 text-right">Refunded</th><th className="px-3 py-2 text-right">Difference</th></tr></thead>
              <tbody className="divide-y">{byPlat.map((b) => { const g = gap(b); return (
                <tr key={b.plat}><td className="px-3 py-2">{b.plat}</td><td className="tabular px-3 py-2 text-right">{b.orders}</td><td className="tabular px-3 py-2 text-right">{formatINR(b.billed)}</td><td className="tabular px-3 py-2 text-right">{formatINR(b.cash)}</td><td className="tabular px-3 py-2 text-right">{formatINR(b.online)}</td><td className="tabular px-3 py-2 text-right">{formatINR(b.refunded)}</td>
                  <td className={cn("tabular px-3 py-2 text-right font-bold", g > 0.5 ? "text-destructive" : "text-success")}>{formatINR(g)}</td></tr>); })}</tbody>
              <tfoot className="border-t bg-muted/40 text-sm font-bold"><tr><td className="px-3 py-2">Total</td><td className="tabular px-3 py-2 text-right">{tot.orders}</td><td className="tabular px-3 py-2 text-right">{formatINR(tot.billed)}</td><td className="tabular px-3 py-2 text-right">{formatINR(tot.cash)}</td><td className="tabular px-3 py-2 text-right">{formatINR(tot.online)}</td><td className="tabular px-3 py-2 text-right">{formatINR(tot.refunded)}</td><td className="tabular px-3 py-2 text-right text-destructive">{formatINR(tot.billed - tot.collected - tot.refunded)}</td></tr></tfoot>
            </table></div>
            <p className="mt-2 text-xs text-muted-foreground">Difference = billed − collected − refunded. A positive figure is money still with customers or executives.</p>
          </>
        )
      ) : !st.length ? <EmptyState title="No settlement lines yet" body="Run a settlement to compute gross, commission and net per platform." /> : (
        <div className="surface overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Platform</th><th className="px-3 py-2">Period</th>{["Gross", "Discounts", "Commission", "Refunds", "Net"].map((h) => <th key={h} className="px-3 py-2 text-right">{h}</th>)}</tr></thead>
          <tbody className="divide-y">{st.map((r) => (
            <tr key={r.id}><td className="px-3 py-2"><SourceTag k={r.source_key} /></td><td className="px-3 py-2 text-xs">{r.period_start} → {r.period_end}</td>
              {(["gross", "discounts", "commission", "refunds", "net"] as const).map((k) => <td key={k} className={cn("tabular px-3 py-2 text-right", k === "net" && "font-bold")}>{formatINR(Number(r[k]))}</td>)}</tr>))}</tbody>
          <tfoot className="border-t bg-muted/40 text-sm font-bold"><tr><td className="px-3 py-2" colSpan={2}>Total</td>{(["gross", "discounts", "commission", "refunds", "net"] as const).map((k) => <td key={k} className="tabular px-3 py-2 text-right">{formatINR(stTotal(k))}</td>)}</tr></tfoot>
        </table></div>
      )}
    </div>
  );
}
