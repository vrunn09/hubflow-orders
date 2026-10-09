import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { dailySeries, groupSum, useOrdersSince, useSources } from "@/lib/queries";
import { formatINR } from "@/lib/order-status";
import { RoleGuard } from "@/components/app/Guard";
import { CardsSkeleton, EmptyState, ErrorState, PageHeader, StatCard } from "@/components/app/states";
import { EnvTag, Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { platformName } from "@/lib/print-bill";

export const Route = createFileRoute("/_authenticated/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — RailFeasto Order Hub" }, { name: "description", content: "Live overview of today's orders." }, { property: "og:title", content: "Dashboard" }, { property: "og:description", content: "Live overview of today's orders." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Dashboard /></RoleGuard>,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Dashboard() {
  const { restaurantId } = useTenant();
  const q = useOrdersSince(restaurantId, 7);
  const sources = useSources(restaurantId);
  const notes = useQuery({
    queryKey: ["notifications", "recent", restaurantId],
    queryFn: async () => (await supabase.from("notifications").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(6)).data ?? [],
  });

  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const rows = q.data ?? [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = rows.filter((r) => r.created_at.slice(0, 10) === todayKey);
  const by = (s: string) => today.filter((r) => r.status === s).length;
  const valid = today.filter((r) => !["CANCELLED", "FAILED", "REFUNDED"].includes(r.status));
  const sales = valid.reduce((s, r) => s + Number(r.total), 0);
  const pending = rows.filter((r) => r.payment_status === "PENDING" && !["CANCELLED", "FAILED"].includes(r.status)).reduce((s, r) => s + Number(r.total), 0);
  const series = dailySeries(rows, 7);
  const platOrders = groupSum(rows, (r) => platformName(r.source_platform ?? r.source_key));
  const platRevenue = groupSum(rows.filter((r) => !["CANCELLED", "FAILED", "REFUNDED"].includes(r.status)), (r) => platformName(r.source_platform ?? r.source_key), (r) => Number(r.total));

  return (
    <div>
      <PageHeader title="Dashboard" description="Today across every connected source. Updates live."
        actions={<><Button variant="outline" asChild><Link to="/order-sources">Sources</Link></Button><Button variant="saffron" asChild><Link to="/orders" search={{ new: true }}><Plus />Manual order</Link></Button></>} />
      {q.isLoading ? <CardsSkeleton n={8} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Today's sales" value={formatINR(sales)} hint={`${valid.length} billable orders`} accent />
            <StatCard label="Total orders" value={today.length} hint="today" />
            <StatCard label="Pending payments" value={formatINR(pending)} hint="last 7 days" />
            <StatCard label="Cancelled" value={by("CANCELLED")} hint="today" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {(["NEW", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "ASSIGNED"] as const).map((s) => (
              <Link key={s} to="/orders" search={{ status: s }} className="surface px-3 py-2.5 hover:border-saffron/50">
                <Pill value={s} /><div className="tabular mt-1.5 text-xl font-bold">{by(s)}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Sales · 7 days">
          <ResponsiveContainer height={220}><AreaChart data={series}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} width={50} /><Tooltip formatter={(v: number) => formatINR(v)} /><Area dataKey="sales" stroke="var(--chart-1)" fill="var(--saffron-soft)" strokeWidth={2} /></AreaChart></ResponsiveContainer>
        </Panel>
        <Panel title="Orders · 7 days">
          <ResponsiveContainer height={220}><BarChart data={series}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} width={30} allowDecimals={false} /><Tooltip /><Bar dataKey="orders" fill="var(--chart-2)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
        </Panel>
        <Panel title="Orders by platform">
          {platOrders.length ? <ResponsiveContainer height={200}><PieChart><Pie data={platOrders} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>{platOrders.map((_, i) => <Cell key={i} fill={COLORS[i % 5]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <Muted>No orders yet</Muted>}
        </Panel>
        <Panel title="Revenue by platform">
          {platRevenue.length ? <ResponsiveContainer height={200}><BarChart data={platRevenue} layout="vertical"><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" width={90} fontSize={11} /><Tooltip formatter={(v: number) => formatINR(v)} /><Bar dataKey="value" fill="var(--chart-1)" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer> : <Muted>No revenue yet</Muted>}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Live order feed" className="lg:col-span-2">
          {!rows.length ? <EmptyState title="No orders yet" body="Connect a source or create a manual order to see it here instantly." action={<Button asChild size="sm"><Link to="/order-sources/connect">Connect a source</Link></Button>} /> : (
            <ul className="divide-y">
              {rows.slice(0, 8).map((o) => (
                <li key={o.id} className="row-flash">
                  <Link to="/orders/$id" params={{ id: o.id }} className="flex items-center gap-3 py-2.5 text-sm hover:bg-muted/50">
                    <span className="w-20 font-mono text-xs">{o.order_number}</span>
                    <span className="text-[11px] font-semibold text-saffron">{platformName(o.source_platform ?? o.source_key)}</span>
                    <span className="min-w-0 flex-1 truncate">{o.customer_name}{o.train_number && <span className="text-muted-foreground"> · {o.train_number} · {o.delivery_station}</span>}</span>
                    <span className="tabular hidden font-semibold sm:inline">{formatINR(o.total)}</span>
                    <Pill value={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="Integration health">
            <ul className="space-y-2 text-sm">
              {(sources.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${s.status === "connected" && s.health === "healthy" ? "bg-success" : s.status === "paused" || s.health === "degraded" ? "bg-warning" : s.status === "error" ? "bg-destructive" : "bg-muted-foreground/40"}`} />
                  <span className="flex-1 truncate">{s.display_name}</span><EnvTag env={s.environment} />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Notifications">
            {!notes.data?.length ? <Muted>All caught up</Muted> : (
              <ul className="space-y-2 text-sm">{notes.data.map((n) => <li key={n.id}><div className="font-medium">{n.title}</div><div className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {n.category}</div></li>)}</ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export function Panel({ title, children, className, actions }: { title: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-lg border bg-card ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2 bg-foreground px-4 py-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-background">{title}</h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
const Muted = ({ children }: { children: React.ReactNode }) => <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
