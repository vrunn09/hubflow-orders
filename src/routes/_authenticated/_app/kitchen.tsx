import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, TrainFront } from "lucide-react";
import { useTenant } from "@/lib/tenant";
import { useActiveOrdersWithItems } from "@/lib/queries";
import { updateOrderStatus } from "@/lib/api.functions";
import { RoleGuard } from "@/components/app/Guard";
import { ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { SourceTag } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/kitchen")({
  head: () => ({ meta: [{ title: "Kitchen display — RailFeasto Order Hub" }, { name: "description", content: "Live kitchen display system." }, { property: "og:title", content: "Kitchen display" }, { property: "og:description", content: "Live kitchen display system." }] }),
  component: () => <RoleGuard roles={["owner", "manager", "kitchen"]}><KDS /></RoleGuard>,
});

const COLS = [
  { s: "NEW", label: "New", next: "ACCEPTED", action: "Accept" },
  { s: "ACCEPTED", label: "Accepted", next: "PREPARING", action: "Start preparing" },
  { s: "PREPARING", label: "Preparing", next: "READY", action: "Mark ready" },
  { s: "READY", label: "Ready", next: null, action: null },
] as const;

function useNow() { const [n, setN] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setN(Date.now()), 30_000); return () => clearInterval(t); }, []); return n; }

function KDS() {
  const { restaurantId } = useTenant();
  const q = useActiveOrdersWithItems(restaurantId, ["NEW", "ACCEPTED", "PREPARING", "READY"]);
  const set = useServerFn(updateOrderStatus);
  const qc = useQueryClient();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);

  if (q.isLoading) return <TableSkeleton />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const rows = q.data ?? [];

  return (
    <div>
      <PageHeader title="Kitchen display" description="Oldest first. New orders appear automatically." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((col) => {
          const list = rows.filter((r) => r.status === col.s);
          return (
            <section key={col.s} className="rounded-lg bg-muted/60 p-2">
              <h2 className="flex items-center justify-between px-1.5 pb-2 text-sm font-bold">{col.label}<span className="tabular rounded-full bg-card px-2 text-xs">{list.length}</span></h2>
              <div className="space-y-2">
                {!list.length && <p className="py-6 text-center text-xs text-muted-foreground">Nothing here</p>}
                {list.map((o) => {
                  const mins = o.deliver_by ? Math.round((new Date(o.deliver_by).getTime() - now) / 60000) : null;
                  const urgent = o.priority !== "normal" || (mins !== null && mins < 30);
                  return (
                    <article key={o.id} className={cn("surface p-3", urgent && "border-l-4 border-l-saffron")}>
                      <div className="flex items-center gap-2"><span className="font-mono text-sm font-bold">{o.order_number}</span><SourceTag k={o.source_key} />
                        {urgent && <span className="ml-auto text-[10px] font-bold uppercase text-saffron">Priority</span>}</div>
                      <ul className="mt-2 space-y-0.5 text-sm">{o.order_items.map((i, k) => <li key={k}><span className="tabular font-bold">{i.quantity}×</span> {i.name}{i.notes && <span className="text-xs text-muted-foreground"> — {i.notes}</span>}</li>)}</ul>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {o.train_number && <span className="flex items-center gap-1"><TrainFront className="size-3" />{o.train_number} · {o.delivery_station}</span>}
                        {mins !== null && <span className={cn("flex items-center gap-1", mins < 30 && "font-semibold text-destructive")}><Clock className="size-3" />{mins >= 0 ? `${mins} min left` : `${-mins} min late`}</span>}
                      </div>
                      {col.next && (
                        <Button size="sm" className="mt-3 w-full" variant={col.s === "NEW" ? "saffron" : "default"} disabled={busy === o.id}
                          onClick={async () => { setBusy(o.id); try { await set({ data: { orderId: o.id, to: col.next! } }); qc.invalidateQueries({ queryKey: ["orders"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } setBusy(null); }}>
                          {col.action}
                        </Button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
