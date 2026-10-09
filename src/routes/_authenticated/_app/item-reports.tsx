import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { formatINR } from "@/lib/order-status";
import { downloadCsv } from "@/lib/queries";
import { RoleGuard } from "@/components/app/Guard";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/item-reports")({
  head: () => ({ meta: [{ title: "Item Reports — RailFeasto Order Hub" }, { name: "description", content: "What sells, how much, and where." }, { property: "og:title", content: "Item Reports" }, { property: "og:description", content: "What sells, how much, and where." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><ItemReports /></RoleGuard>,
});

const RANGES = [{ k: "7", t: "7 days" }, { k: "30", t: "30 days" }, { k: "90", t: "90 days" }] as const;
type Row = { item: string; qty: number; orders: number; revenue: number; avg: number; last: string; platforms: string };

function ItemReports() {
  const { restaurantId } = useTenant();
  const [days, setDays] = useState<(typeof RANGES)[number]["k"]>("30");
  const [term, setTerm] = useState("");

  const q = useQuery({
    queryKey: ["item-reports", restaurantId, days],
    queryFn: async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (Number(days) - 1));
      const { data, error } = await supabase.from("order_items")
        .select("name, quantity, unit_price, created_at, orders(id, status, source_key, source_platform)")
        .eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).limit(20000);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const rows = useMemo<Row[]>(() => {
    const m = new Map<string, Row>();
    for (const line of q.data ?? []) {
      const o = line.orders as { status: string; source_key: string; source_platform: string | null } | null;
      if (!o || ["CANCELLED", "FAILED", "REFUNDED"].includes(o.status)) continue;
      const name = line.name.trim().toUpperCase();
      const r = m.get(name) ?? { item: name, qty: 0, orders: 0, revenue: 0, avg: 0, last: "", platforms: "" };
      r.qty += line.quantity;
      r.orders += 1;
      r.revenue += line.quantity * Number(line.unit_price);
      if (line.created_at > r.last) r.last = line.created_at;
      const plat = (o.source_platform ?? o.source_key ?? "other").toLowerCase();
      if (!r.platforms.includes(plat)) r.platforms += (r.platforms ? ", " : "") + plat;
      m.set(name, r);
    }
    return [...m.values()].map((r) => ({ ...r, avg: r.orders ? r.revenue / r.qty : 0 })).sort((a, b) => b.revenue - a.revenue);
  }, [q.data]);

  const shown = term ? rows.filter((r) => r.item.includes(term.toUpperCase())) : rows;
  const totQty = shown.reduce((s, r) => s + r.qty, 0);
  const totRev = shown.reduce((s, r) => s + r.revenue, 0);

  return (
    <div>
      <PageHeader title="Item Reports" description="Every dish ranked by what it actually earned. Cancelled orders are excluded."
        actions={<Button size="sm" variant="outline" disabled={!shown.length} onClick={() => downloadCsv(`item-report-${days}d-${new Date().toISOString().slice(0, 10)}.csv`, shown.map((r) => ({
          item: r.item, quantity_sold: r.qty, orders_containing: r.orders, revenue: Number(r.revenue.toFixed(2)), avg_price: Number(r.avg.toFixed(2)),
          platforms: r.platforms, last_sold: r.last ? new Date(r.last).toLocaleDateString("en-IN") : "",
        })))}><Download />Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border p-0.5">{RANGES.map((r) => <button key={r.k} onClick={() => setDays(r.k)} className={cn("rounded px-2.5 py-1 text-xs", days === r.k ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{r.t}</button>)}</div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search item" className="pl-8" />
        </div>
        <span className="tabular ml-auto text-xs text-muted-foreground">{shown.length} items · {totQty} sold · {formatINR(totRev)}</span>
      </div>
      {q.isLoading ? <TableSkeleton /> : !shown.length ? <EmptyState title="No item data yet" body="Orders in this period will build the item report automatically." /> : (
        <div className="surface overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty sold</th><th className="px-3 py-2 text-right">Orders</th><th className="px-3 py-2 text-right">Revenue</th><th className="hidden px-3 py-2 text-right sm:table-cell">Avg price</th><th className="hidden px-3 py-2 lg:table-cell">Platforms</th><th className="hidden px-3 py-2 sm:table-cell">Last sold</th></tr></thead>
          <tbody className="divide-y">{shown.map((r) => (
            <tr key={r.item}><td className="px-3 py-2 font-medium">{r.item}</td><td className="tabular px-3 py-2 text-right">{r.qty}</td><td className="tabular px-3 py-2 text-right">{r.orders}</td><td className="tabular px-3 py-2 text-right font-semibold">{formatINR(r.revenue)}</td><td className="tabular hidden px-3 py-2 text-right sm:table-cell">{formatINR(r.avg)}</td><td className="hidden px-3 py-2 text-xs capitalize lg:table-cell">{r.platforms}</td><td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">{r.last ? new Date(r.last).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</td></tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}
