import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { dismissIngestionJob, retryIngestionJob } from "@/lib/api.functions";
import { INGEST_ERRORS, type IngestErrorCode } from "@/lib/ingest-errors";
import { platformName } from "@/lib/print-bill";

export const Route = createFileRoute("/_authenticated/_app/notifications")({
  head: () => ({ meta: [{ title: "Notifications — RailFeasto Order Hub" }, { name: "description", content: "Order, payment, kitchen, delivery and integration alerts." }, { property: "og:title", content: "Notifications" }, { property: "og:description", content: "All alerts in one place." }] }),
  component: Notifications,
});

const CATS = [["", "All"], ["order", "New orders"], ["payment", "Payments"], ["kitchen", "Kitchen"], ["delivery", "Delivery"], ["integration", "Integration errors"], ["system", "System"]] as const;
const OPEN = ["failed", "needs_review", "dead_letter", "processing"];
const STATUS_LABEL: Record<string, string> = { failed: "Retrying", needs_review: "Needs review", dead_letter: "Gave up — retry manually", processing: "Processing" };
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "—");

type Job = { id: string; status: string; error_code: string | null; last_error: string | null; attempts: number; max_attempts: number; last_attempt_at: string | null; next_attempt_at: string; created_at: string; payload: unknown; order_id: string | null };

function ImportProblems({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const retry = useServerFn(retryIngestionJob);
  const dismiss = useServerFn(dismissIngestionJob);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<Job | null>(null);
  const q = useQuery({
    queryKey: ["ingest-problems", restaurantId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ingestion_jobs")
        .select("id,status,error_code,last_error,attempts,max_attempts,last_attempt_at,next_attempt_at,created_at,payload,order_id")
        .eq("restaurant_id", restaurantId).in("status", OPEN).order("updated_at", { ascending: false }).limit(100);
      if (error) throw error; return data as Job[];
    },
  });
  const act = async (id: string, kind: "retry" | "dismiss") => {
    setBusy(id);
    try {
      if (kind === "retry") {
        const r = await retry({ data: { jobId: id } });
        if (r.status === "created") toast.success("Order imported");
        else if (r.status === "duplicate") toast.success("Order already exists — marked done");
        else if (r.status === "ignored") toast.info("Not a new order — set aside");
        else toast.error(`Still failing: ${r.error ?? r.errorCode}`);
      } else { await dismiss({ data: { jobId: id } }); toast.success("Dismissed"); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
    setBusy(null); setDetail(null);
    qc.invalidateQueries({ queryKey: ["ingest-problems"] }); qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  if (q.isLoading || q.error || !q.data?.length) return null;
  const meta = (j: Job) => (j.payload && typeof j.payload === "object" ? (j.payload as { subject?: string; platform?: string; from?: string }) : {});
  return (
    <div className="surface mb-4">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="text-sm font-semibold">Order import problems <span className="text-muted-foreground">({q.data.length})</span></div>
        <div className="text-[11px] text-muted-foreground">Alerts stay open until the import actually succeeds</div>
      </div>
      <ul className="divide-y">
        {q.data.map((j) => {
          const m = meta(j); const code = (j.error_code ?? "UNKNOWN") as IngestErrorCode;
          return (
            <li key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{INGEST_ERRORS[code]?.label ?? j.last_error ?? "Import failed"}</div>
                <div className="truncate text-xs text-muted-foreground">{m.subject ?? "Order payload"} · {platformName(m.platform ?? "") || "Unknown platform"}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className={cn("mr-2 rounded px-1.5 py-0.5", j.status === "failed" ? "bg-saffron-soft" : "bg-destructive/10 text-destructive")}>{STATUS_LABEL[j.status] ?? j.status}</span>
                  Attempts {j.attempts}/{j.max_attempts} · Last try {fmt(j.last_attempt_at ?? j.created_at)}{j.status === "failed" ? ` · Next ${fmt(j.next_attempt_at)}` : ""} · {code}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setDetail(j)}>View details</Button>
                <Button size="sm" disabled={busy === j.id || j.status === "processing"} onClick={() => act(j.id, "retry")}>Retry</Button>
                <Button size="sm" variant="ghost" disabled={busy === j.id || j.status === "processing"} onClick={() => act(j.id, "dismiss")}>Dismiss</Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Import details</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <div><b>Reason:</b> {detail.last_error ?? "—"} <span className="text-muted-foreground">({detail.error_code})</span></div>
              <div><b>Status:</b> {STATUS_LABEL[detail.status] ?? detail.status} · attempts {detail.attempts}/{detail.max_attempts}</div>
              <div><b>Received:</b> {fmt(detail.created_at)} · <b>Last attempt:</b> {fmt(detail.last_attempt_at)}</div>
              <div><b>Platform:</b> {platformName(meta(detail).platform ?? "") || "Unknown"} · <b>Subject:</b> {meta(detail).subject ?? "—"}</div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                {(() => { const p = detail.payload as { body?: string } | string | null; return typeof p === "string" ? p.slice(0, 4000) : p?.body ? p.body.slice(0, 4000) : JSON.stringify(p, null, 2).slice(0, 4000); })()}
              </pre>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => act(detail.id, "dismiss")}>Dismiss</Button>
                <Button onClick={() => act(detail.id, "retry")}>Retry now</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Notifications() {
  const { restaurantId } = useTenant();
  const qc = useQueryClient();
  const [cat, setCat] = useState("");
  const q = useQuery({
    queryKey: ["notifications", "list", restaurantId, cat],
    queryFn: async () => {
      let s = supabase.from("notifications").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(300);
      if (cat) s = s.eq("category", cat);
      const { data, error } = await s; if (error) throw error; return data;
    },
  });
  // Group repeats (same group key, or same title+body) into one row with a count.
  const rows = useMemo(() => {
    const out: (NonNullable<typeof q.data>[number] & { count: number })[] = [];
    const idx = new Map<string, number>();
    for (const n of q.data ?? []) {
      const k = n.group_key ?? `${n.category}|${n.title}|${n.body ?? ""}`;
      const i = idx.get(k);
      if (i !== undefined) { out[i].count += n.occurrences ?? 1; continue; }
      idx.set(k, out.length); out.push({ ...n, count: n.occurrences ?? 1 });
    }
    return out;
  }, [q.data]);
  const markAll = async () => { await supabase.from("notifications").update({ read: true }).eq("restaurant_id", restaurantId).eq("read", false); qc.invalidateQueries({ queryKey: ["notifications"] }); };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" actions={<Button variant="outline" size="sm" onClick={markAll}>Mark all read</Button>} />
      {restaurantId && <ImportProblems restaurantId={restaurantId} />}
      <div className="mb-3 flex flex-wrap gap-1">{CATS.map(([v, l]) => <button key={v} onClick={() => setCat(v)} className={cn("rounded-md px-2.5 py-1 text-xs", cat === v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{l}</button>)}</div>
      {q.isLoading ? <TableSkeleton /> : q.error ? <ErrorState error={q.error} /> : !rows.length ? <EmptyState title="No notifications" body="You're all caught up." /> : (
        <ul className="surface divide-y">
          {rows.map((n) => (
            <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.read && "bg-saffron-soft/40")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.category === "integration" && !n.resolved_at ? "bg-destructive" : n.read ? "bg-transparent" : "bg-saffron")} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {n.link ? <a href={n.link} className="hover:underline">{n.title}</a> : n.title}
                  {n.count > 1 && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">×{n.count}</span>}
                  {n.category === "integration" && n.resolved_at && <span className="ml-2 text-[11px] text-muted-foreground">resolved</span>}
                </div>
                {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
              </div>
              <div className="text-right text-[11px] text-muted-foreground"><div className="uppercase">{n.category}</div>{fmt(n.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
