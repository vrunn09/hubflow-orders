import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { z } from "zod";
import { useTenant } from "@/lib/tenant";
import { useOrdersSince } from "@/lib/queries";
import { formatINR } from "@/lib/order-status";
import { CONNECTORS } from "@/lib/connectors/registry";
import { RoleGuard } from "@/components/app/Guard";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { Pill, SourceTag } from "@/components/app/badges";
import { ManualOrderDialog } from "@/components/app/ManualOrderDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const search = z.object({ status: z.string().optional(), new: z.boolean().optional() });
export const Route = createFileRoute("/_authenticated/_app/orders/")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Orders — RailFeasto Order Hub" }, { name: "description", content: "All orders from every source." }, { property: "og:title", content: "Orders" }, { property: "og:description", content: "All orders from every source." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Orders /></RoleGuard>,
});

const TABS = [["", "All"], ["NEW", "New"], ["ACCEPTED", "Accepted"], ["PREPARING", "Preparing"], ["READY", "Ready"], ["ASSIGNED", "Assigned"], ["OUT_FOR_DELIVERY", "Out for delivery"], ["DELIVERED", "Delivered"], ["CANCELLED", "Cancelled"]] as const;
const sel = "h-9 rounded-md border bg-card px-2 text-sm";

function Orders() {
  const { restaurantId } = useTenant();
  const sp = Route.useSearch();
  const nav = useNavigate({ from: "/orders/" });
  const [days, setDays] = useState(7);
  const q = useOrdersSince(restaurantId, days, "list");
  const [term, setTerm] = useState("");
  const [f, setF] = useState({ source: "", payment: "", station: "", train: "", delivery: "", min: "", max: "" });
  const status = sp.status ?? "";

  const rows = useMemo(() => (q.data ?? []).filter((o) => {
    if (status && o.status !== status) return false;
    if (f.source && o.source_key !== f.source) return false;
    if (f.payment && o.payment_status !== f.payment) return false;
    if (f.station && o.delivery_station !== f.station) return false;
    if (f.train && !(o.train_number ?? "").includes(f.train)) return false;
    if (f.delivery && o.delivery_status !== f.delivery) return false;
    if (f.min && Number(o.total) < +f.min) return false;
    if (f.max && Number(o.total) > +f.max) return false;
    if (term) {
      const t = term.toLowerCase();
      if (![o.order_number, o.external_order_id, o.customer_name, o.customer_phone ?? ""].some((v) => v.toLowerCase().includes(t))) return false;
    }
    return true;
  }), [q.data, status, f, term]);
  const stations = [...new Set((q.data ?? []).map((o) => o.delivery_station).filter(Boolean))] as string[];
  const counts = (s: string) => (q.data ?? []).filter((o) => !s || o.status === s).length;

  return (
    <div>
      <PageHeader title="Orders" description="Every order from every source in one unified list."
        actions={<Button variant="saffron" onClick={() => nav({ search: { ...sp, new: true } })}><Plus />Manual order</Button>} />
      <ManualOrderDialog open={!!sp.new} onOpenChange={(o) => nav({ search: { ...sp, new: o || undefined } })} />

      <div className="-mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 border-b">
          {TABS.map(([v, l]) => (
            <button key={v} onClick={() => nav({ search: { ...sp, status: v || undefined } })}
              className={cn("-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap", status === v ? "border-saffron font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {l} <span className="tabular text-xs text-muted-foreground">{counts(v)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Order ID, external ID, customer…" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
        <select className={sel} value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Date range"><option value={1}>Today</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select>
        <select className={sel} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} aria-label="Platform"><option value="">All platforms</option>{CONNECTORS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
        <select className={sel} value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })} aria-label="Payment"><option value="">Any payment</option>{["PENDING", "PAID", "FAILED", "REFUNDED"].map((p) => <option key={p}>{p}</option>)}</select>
        <select className={sel} value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })} aria-label="Station"><option value="">All stations</option>{stations.map((s) => <option key={s}>{s}</option>)}</select>
        <select className={sel} value={f.delivery} onChange={(e) => setF({ ...f, delivery: e.target.value })} aria-label="Delivery status"><option value="">Any delivery</option>{["UNASSIGNED", "ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"].map((p) => <option key={p}>{p}</option>)}</select>
        <Input className="w-24" placeholder="Train" value={f.train} onChange={(e) => setF({ ...f, train: e.target.value })} />
        <Input className="w-20" placeholder="Min ₹" type="number" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
        <Input className="w-20" placeholder="Max ₹" type="number" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
      </div>

      {q.isLoading ? <TableSkeleton /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !rows.length ? (
        <EmptyState title="No orders match" body="Try a different tab or filter, or create a manual order." />
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Customer</th><th className="hidden px-3 py-2 md:table-cell">Train / station</th><th className="px-3 py-2 text-right">Total</th><th className="hidden px-3 py-2 sm:table-cell">Payment</th><th className="px-3 py-2">Status</th><th className="hidden px-3 py-2 lg:table-cell">Placed</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2.5"><Link to="/orders/$id" params={{ id: o.id }} className="font-mono text-xs font-semibold hover:text-saffron">{o.order_number}</Link><div className="max-w-28 truncate text-[11px] text-muted-foreground">{o.external_order_id}</div></td>
                  <td className="px-3 py-2.5"><SourceTag k={o.source_key} /></td>
                  <td className="px-3 py-2.5">{o.customer_name}</td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{o.train_number ? `${o.train_number} · ${o.coach ?? ""}/${o.seat ?? ""}` : "—"}<div className="text-xs">{o.delivery_station}</div></td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold">{formatINR(o.total)}</td>
                  <td className="hidden px-3 py-2.5 sm:table-cell"><Pill value={o.payment_status} /> <span className="text-xs text-muted-foreground">{o.payment_method}</span></td>
                  <td className="px-3 py-2.5"><Pill value={o.status} /></td>
                  <td className="tabular hidden px-3 py-2.5 text-xs text-muted-foreground lg:table-cell">{new Date(o.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
