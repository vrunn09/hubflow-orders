import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Printer, TrainFront } from "lucide-react";
import { useTenant } from "@/lib/tenant";
import { useActiveOrdersWithItems } from "@/lib/queries";
import { updateOrderStatus } from "@/lib/api.functions";
import { isKotAutoPrint, printKOT, setKotAutoPrint } from "@/lib/print-bill";
import { RoleGuard } from "@/components/app/Guard";
import { ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { SourceTag } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/kitchen")({
  head: () => ({ meta: [{ title: "Kitchen / KOT — RailFeasto Order Hub" }, { name: "description", content: "Live kitchen display with KOT printing." }, { property: "og:title", content: "Kitchen / KOT" }, { property: "og:description", content: "Live kitchen display with KOT printing." }] }),
  component: () => <RoleGuard roles={["owner", "manager", "kitchen"]}><KDS /></RoleGuard>,
});

const COLS = [
  { s: "NEW", label: "New", next: "ACCEPTED", action: "Accept" },
  { s: "ACCEPTED", label: "Accepted", next: "PREPARING", action: "Start preparing" },
  { s: "PREPARING", label: "Preparing", next: "READY", action: "Mark ready" },
  { s: "READY", label: "Ready", next: null, action: null },
] as const;

/** Ticks every second so the waiting timer on each ticket is live. */
function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

const mmss = (sec: number) => `${Math.floor(Math.abs(sec) / 60)}:${String(Math.abs(sec) % 60).padStart(2, "0")}`;

function Timer({ since, now }: { since: string; now: number }) {
  const sec = Math.round((now - new Date(since).getTime()) / 1000);
  const tone = sec > 20 * 60 ? "bg-destructive-soft text-destructive" : sec > 10 * 60 ? "bg-warning-soft text-warning" : "bg-success-soft text-success";
  return (
    <span className={cn("tabular inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold", tone)} title="Time since the order came in">
      <Clock className="size-3" />{mmss(sec)} waited
    </span>
  );
}

function KDS() {
  const { restaurantId } = useTenant();
  const q = useActiveOrdersWithItems(restaurantId, ["NEW", "ACCEPTED", "PREPARING", "READY"]);
  const set = useServerFn(updateOrderStatus);
  const qc = useQueryClient();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [autoKot, setAutoKot] = useState(false);
  useEffect(() => setAutoKot(isKotAutoPrint()), []);

  async function move(id: string, to: string, action: string, kot: boolean) {
    setBusy(id);
    try {
      await set({ data: { orderId: id, to: to as never } });
      qc.invalidateQueries({ queryKey: ["orders"] });
      if (kot) await printKOT(id).catch(() => toast.error("KOT could not be printed — check the printer"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${action} failed`);
    }
    setBusy(null);
  }

  if (q.isLoading) return <TableSkeleton />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const rows = q.data ?? [];

  return (
    <div>
      <PageHeader title="Kitchen / KOT" description="Oldest first. New orders appear automatically. No prices are shown here."
        actions={
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={autoKot} onCheckedChange={(v) => { setAutoKot(v); setKotAutoPrint(v); }} aria-label="Auto-print KOT on accept" />
            Auto-print KOT on accept
          </label>
        } />
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold">{o.order_number}</span>
                        <SourceTag k={o.source_key} />
                        <Timer since={o.created_at} now={now} />
                        {urgent && <span className="ml-auto text-[10px] font-bold uppercase text-saffron">Priority</span>}
                      </div>
                      <ul className="mt-2 space-y-0.5 text-sm">
                        {o.order_items.map((i, k) => <li key={k}><span className="tabular font-bold">{i.quantity}×</span> {i.name}{i.notes && <span className="text-xs text-muted-foreground"> — {i.notes}</span>}</li>)}
                      </ul>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {o.train_number && <span className="flex items-center gap-1"><TrainFront className="size-3" />{o.train_number} · {o.delivery_station}</span>}
                        {mins !== null && <span className={cn("flex items-center gap-1", mins < 30 && "font-semibold text-destructive")}><Clock className="size-3" />{mins >= 0 ? `${mins} min to deliver` : `${-mins} min late`}</span>}
                      </div>
                      <div className="mt-3 flex gap-2">
                        {col.next && (
                          <Button size="sm" className="flex-1" variant={col.s === "NEW" ? "saffron" : "default"} disabled={busy === o.id}
                            onClick={() => move(o.id, col.next!, col.action!, col.s === "NEW" && autoKot)}>
                            {col.action}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" disabled={busy === o.id} title="Print the kitchen ticket"
                          onClick={() => { setBusy(o.id); printKOT(o.id, col.s !== "NEW").then(() => toast.success("KOT sent to printer")).catch(() => toast.error("Printer not reachable")); setBusy(null); }}>
                          <Printer className="size-4" />{col.s === "NEW" ? "KOT" : "Reprint"}
                        </Button>
                      </div>
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
