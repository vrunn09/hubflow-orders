import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { formatINR } from "@/lib/order-status";
import { RoleGuard } from "@/components/app/Guard";
import { CardsSkeleton, EmptyState, ErrorState, PageHeader, StatCard } from "@/components/app/states";
import { Pill } from "@/components/app/badges";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/payments")({
  head: () => ({ meta: [{ title: "Payments — RailFeasto Order Hub" }, { name: "description", content: "Revenue and transaction history." }, { property: "og:title", content: "Payments" }, { property: "og:description", content: "Revenue and transaction history." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Payments /></RoleGuard>,
});

const TABS = ["All", "Online", "Offline", "Pending", "Failed", "Refunds"] as const;

function Payments() {
  const { restaurantId } = useTenant();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const q = useQuery({
    queryKey: ["payments", restaurantId],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const [p, r] = await Promise.all([
        supabase.from("payments").select("*, orders(order_number, customer_name, source_key)").eq("restaurant_id", restaurantId).gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
        supabase.from("refunds").select("*, orders(order_number, customer_name)").eq("restaurant_id", restaurantId).gte("created_at", since).order("created_at", { ascending: false }),
      ]);
      if (p.error) throw p.error;
      return { payments: p.data, refunds: r.data ?? [] };
    },
  });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const p = q.data?.payments ?? [];
  const sum = (rows: typeof p) => rows.reduce((s, x) => s + Number(x.amount), 0);
  const list = tab === "Online" ? p.filter((x) => x.mode === "online") : tab === "Offline" ? p.filter((x) => x.mode === "offline") : tab === "Pending" ? p.filter((x) => x.status === "PENDING") : tab === "Failed" ? p.filter((x) => x.status === "FAILED") : p;

  return (
    <div>
      <PageHeader title="Payments" description="Last 30 days. Payment status is set only by server-side verification." />
      {q.isLoading ? <CardsSkeleton /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Collected" value={formatINR(sum(p.filter((x) => x.status === "PAID")))} accent />
          <StatCard label="Online" value={formatINR(sum(p.filter((x) => x.mode === "online" && x.status === "PAID")))} />
          <StatCard label="Offline (cash)" value={formatINR(sum(p.filter((x) => x.mode === "offline" && x.status === "PAID")))} />
          <StatCard label="Pending" value={formatINR(sum(p.filter((x) => x.status === "PENDING")))} />
          <StatCard label="Refunded" value={formatINR((q.data?.refunds ?? []).reduce((s, r) => s + Number(r.amount), 0))} />
        </div>
      )}
      <div className="mb-3 mt-6 flex flex-wrap gap-1">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{t}</button>)}</div>
      {tab === "Refunds" ? (
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
