import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { dailySeries, groupSum, useOrdersSince } from "@/lib/queries";
import { formatINR } from "@/lib/order-status";
import { CONNECTORS } from "@/lib/connectors/registry";
import { RoleGuard } from "@/components/app/Guard";
import { CardsSkeleton, ErrorState, PageHeader, StatCard } from "@/components/app/states";
import { Panel } from "./dashboard";

export const Route = createFileRoute("/_authenticated/_app/analytics")({
  head: () => ({ meta: [{ title: "Analytics — RailFeasto Order Hub" }, { name: "description", content: "Sales, orders and platform performance." }, { property: "og:title", content: "Analytics" }, { property: "og:description", content: "Sales, orders and platform performance." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Analytics /></RoleGuard>,
});
const name = (k: string) => CONNECTORS.find((c) => c.key === k)?.name.split(" (")[0]?.split(" /")[0] ?? k;

function Analytics() {
  const { restaurantId } = useTenant();
  const [days, setDays] = useState(30);
  const q = useOrdersSince(restaurantId, days, "analytics");
  const items = useQuery({
    queryKey: ["items", restaurantId, days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data } = await supabase.from("order_items").select("name, quantity, unit_price, orders!inner(created_at, status)").eq("restaurant_id", restaurantId).gte("orders.created_at", since).limit(5000);
      return data ?? [];
    },
  });
  if (q.error) return <ErrorState error={q.error} />;
  const rows = q.data ?? [];
  const valid = rows.filter((r) => !["CANCELLED", "FAILED", "REFUNDED"].includes(r.status));
  const revenue = valid.reduce((s, r) => s + Number(r.total), 0);
  const cancelled = rows.filter((r) => r.status === "CANCELLED").length;
  const refunded = rows.filter((r) => r.status === "REFUNDED").length;
  const delivered = rows.filter((r) => r.status === "DELIVERED");
  const onTime = delivered.filter((r) => !r.deliver_by || new Date(r.updated_at) <= new Date(r.deliver_by)).length;
  const bySource = CONNECTORS.map((c) => {
    const s = rows.filter((r) => r.source_key === c.key);
    return { name: name(c.key), orders: s.length, revenue: s.filter((r) => !["CANCELLED", "FAILED", "REFUNDED"].includes(r.status)).reduce((a, r) => a + Number(r.total), 0), cancel: s.filter((r) => r.status === "CANCELLED").length };
  }).filter((x) => x.orders);
  const best = groupSum(items.data ?? [], (i) => i.name, (i) => i.quantity).sort((a, b) => b.value - a.value).slice(0, 8);
  const series = dailySeries(rows, Math.min(days, 30));

  return (
    <div>
      <PageHeader title="Analytics" actions={<select className="h-9 rounded-md border bg-card px-2 text-sm" value={days} onChange={(e) => setDays(+e.target.value)}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select>} />
      {q.isLoading ? <CardsSkeleton n={6} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <StatCard label="Revenue" value={formatINR(revenue)} accent /><StatCard label="Orders" value={rows.length} />
          <StatCard label="Avg order value" value={formatINR(valid.length ? revenue / valid.length : 0)} />
          <StatCard label="Cancellation rate" value={`${rows.length ? ((cancelled / rows.length) * 100).toFixed(1) : 0}%`} />
          <StatCard label="Refund rate" value={`${rows.length ? ((refunded / rows.length) * 100).toFixed(1) : 0}%`} />
          <StatCard label="On-time delivery" value={`${delivered.length ? Math.round((onTime / delivered.length) * 100) : 0}%`} hint={`${delivered.length} delivered`} />
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Sales trend"><ResponsiveContainer height={230}><LineChart data={series}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} width={50} /><Tooltip formatter={(v: number) => formatINR(v)} /><Line dataKey="sales" stroke="var(--chart-1)" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></Panel>
        <Panel title="Orders trend"><ResponsiveContainer height={230}><BarChart data={series}><XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} width={30} allowDecimals={false} /><Tooltip /><Bar dataKey="orders" fill="var(--chart-2)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
        <Panel title="Platform performance">
          <table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Platform</th><th className="text-right">Orders</th><th className="text-right">Revenue</th><th className="text-right">AOV</th><th className="text-right">Cancel %</th></tr></thead>
            <tbody className="divide-y">{bySource.map((s) => <tr key={s.name}><td className="py-2">{s.name}</td><td className="tabular text-right">{s.orders}</td><td className="tabular text-right">{formatINR(s.revenue)}</td><td className="tabular text-right">{formatINR(s.revenue / Math.max(1, s.orders - s.cancel))}</td><td className="tabular text-right">{((s.cancel / s.orders) * 100).toFixed(0)}%</td></tr>)}</tbody></table>
        </Panel>
        <Panel title="Best-selling items">
          {best.length ? <ResponsiveContainer height={230}><BarChart data={best} layout="vertical"><XAxis type="number" fontSize={11} allowDecimals={false} /><YAxis type="category" dataKey="name" width={130} fontSize={11} /><Tooltip /><Bar dataKey="value" name="Qty" fill="var(--chart-1)" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer> : <p className="py-8 text-center text-sm text-muted-foreground">No item data yet</p>}
        </Panel>
      </div>
    </div>
  );
}
