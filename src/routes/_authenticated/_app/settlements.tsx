import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { runSettlement } from "@/lib/api.functions";
import { formatINR } from "@/lib/order-status";
import { RoleGuard } from "@/components/app/Guard";
import { EmptyState, ErrorState, PageHeader, StatCard, TableSkeleton } from "@/components/app/states";
import { SourceTag } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/settlements")({
  head: () => ({ meta: [{ title: "Settlements — RailFeasto Order Hub" }, { name: "description", content: "Platform-wise and date-wise settlements." }, { property: "og:title", content: "Settlements" }, { property: "og:description", content: "Platform-wise and date-wise settlements." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Settlements /></RoleGuard>,
});

function Settlements() {
  const { restaurantId } = useTenant();
  const run = useServerFn(runSettlement);
  const [view, setView] = useState<"platform" | "date">("platform");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["settlements", restaurantId],
    queryFn: async () => { const { data, error } = await supabase.from("settlements").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(200); if (error) throw error; return data; },
  });
  const rows = q.data ?? [];
  const t = (k: "gross" | "discounts" | "commission" | "refunds" | "adjustments" | "net") => rows.reduce((s, r) => s + Number(r[k]), 0);
  const grouped = view === "platform"
    ? Object.values(rows.reduce<Record<string, typeof rows>>((m, r) => ((m[r.source_key] ??= []).push(r), m), {}))
    : Object.values(rows.reduce<Record<string, typeof rows>>((m, r) => ((m[`${r.period_start}→${r.period_end}`] ??= []).push(r), m), {}));

  return (
    <div>
      <PageHeader title="Settlements" description="Commission is not applied yet — net = gross − discounts − refunds."
        actions={<Button variant="saffron" disabled={busy} onClick={async () => { setBusy(true); try { const r = await run({ data: { restaurantId, days: 7 } }); toast.success(`Computed ${r.rows} settlement line(s)`); q.refetch(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } setBusy(false); }}>{busy ? "Processing…" : "Run 7-day settlement"}</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Gross sales" value={formatINR(t("gross"))} /><StatCard label="Discounts" value={formatINR(t("discounts"))} /><StatCard label="Commission" value={formatINR(t("commission"))} />
        <StatCard label="Refunds" value={formatINR(t("refunds"))} /><StatCard label="Adjustments" value={formatINR(t("adjustments"))} /><StatCard label="Net settlement" value={formatINR(t("net"))} accent />
      </div>
      <div className="mb-3 mt-6 flex gap-1">{(["platform", "date"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-3 py-1.5 text-sm capitalize", view === v ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>By {v}</button>)}</div>
      {q.isLoading ? <TableSkeleton /> : q.error ? <ErrorState error={q.error} /> : !rows.length ? <EmptyState title="No settlements yet" body="Run a settlement to compute gross, commission and net per platform." /> : (
        <div className="surface overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">{view === "platform" ? "Platform" : "Period"}</th>{["Gross", "Discounts", "Commission", "Refunds", "Net"].map((h) => <th key={h} className="px-3 py-2 text-right">{h}</th>)}</tr></thead>
          <tbody className="divide-y">{grouped.map((g) => { const s = (k: "gross" | "discounts" | "commission" | "refunds" | "net") => g.reduce((a, r) => a + Number(r[k]), 0); return (
            <tr key={view === "platform" ? g[0]!.source_key : g[0]!.period_start + g[0]!.period_end}><td className="px-3 py-2">{view === "platform" ? <SourceTag k={g[0]!.source_key} /> : `${g[0]!.period_start} → ${g[0]!.period_end}`}</td>
              {(["gross", "discounts", "commission", "refunds", "net"] as const).map((k) => <td key={k} className={cn("tabular px-3 py-2 text-right", k === "net" && "font-bold")}>{formatINR(s(k))}</td>)}</tr>); })}</tbody>
        </table></div>
      )}
    </div>
  );
}
