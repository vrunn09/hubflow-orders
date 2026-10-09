import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { printOrderBill, platformName, isAutoPrint, setAutoPrint } from "@/lib/print-bill";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Eye, Plus, Printer, Search } from "lucide-react";
import { z } from "zod";
import { useTenant } from "@/lib/tenant";
import { useOrdersSince } from "@/lib/queries";
import { formatINR } from "@/lib/order-status";
import { CONNECTORS } from "@/lib/connectors/registry";
import { RoleGuard } from "@/components/app/Guard";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { Pill } from "@/components/app/badges";
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
    if (status && !status.split(",").includes(o.status)) return false;
    if (f.source && o.source_key !== f.source && (o.source_platform ?? "").toLowerCase() !== f.source) return false;
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
  const [per, setPer] = useState(50);
  const [page, setPage] = useState(0);
  const pageRows = rows.slice(page * per, (page + 1) * per);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [auto, setAuto] = useState(false);
  useEffect(() => setAuto(isAutoPrint()), []);
  const ids = pageRows.map((o) => o.id);
  const items = useQuery({
    queryKey: ["order-items", ids], enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("order_items").select("id, order_id, name, quantity, unit_price").in("order_id", ids);
      const m: Record<string, NonNullable<typeof data>> = {};
      for (const i of data ?? []) (m[i.order_id] ??= []).push(i);
      return m;
    },
  });
  const stations = [...new Set((q.data ?? []).map((o) => o.delivery_station).filter(Boolean))] as string[];
  const counts = (s: string) => (q.data ?? []).filter((o) => !s || s.split(",").includes(o.status)).length;

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

      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5"><Switch checked={days === 1} onCheckedChange={(v) => setDays(v ? 1 : 7)} />Today only</label>
        <label className="flex items-center gap-1.5"><Switch checked={auto} onCheckedChange={(v) => { setAutoPrint(v); setAuto(v); }} />Auto-print new orders</label>
        <span className="ml-auto text-muted-foreground">{rows.length} orders</span>
      </div>
      {q.isLoading ? <TableSkeleton /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !rows.length ? (
        <EmptyState title="No orders match" body="Try a different tab or filter, or create a manual order." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full min-w-[960px] text-xs">
              <thead className="sticky top-0 bg-primary text-primary-foreground">
                <tr>{["", "Status", "Order ID", "Vendor", "Delivery", "Payment", "Contact", "Train · Coach/Seat · Station", "Amount", "Actions"].map((h) => <th key={h} className="px-2 py-2 text-left font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const isOpen = open.has(o.id);
                  const its = items.data?.[o.id] ?? [];
                  const cod = /cod|cash/i.test(o.payment_method);
                  return (
                    <Fragment key={o.id}>
                      <tr className="border-b hover:bg-muted/40">
                        <td className="px-2 py-2"><button aria-label="Expand" onClick={() => toggle(o.id)} className="rounded-full bg-muted p-1">{isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}</button></td>
                        <td className="px-2 py-2"><Pill value={o.status} /></td>
                        <td className="px-2 py-2"><Link to="/orders/$id" params={{ id: o.id }} className="font-mono font-semibold hover:text-saffron">{o.external_order_id}</Link><div className="text-[10px] text-muted-foreground">{o.order_number}</div></td>
                        <td className="px-2 py-2 font-semibold text-saffron">{platformName(o.source_platform ?? o.source_key)}</td>
                        <td className="tabular px-2 py-2">{o.deliver_by ? new Date(o.deliver_by).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : <span className="text-muted-foreground">Not provided</span>}</td>
                        <td className="px-2 py-2"><span className={cn("rounded px-2 py-0.5 text-[10px] font-bold", cod ? "bg-primary text-primary-foreground" : "bg-success text-success-foreground")}>{o.payment_method.toUpperCase()}</span></td>
                        <td className="tabular px-2 py-2">{o.customer_phone ?? "—"}</td>
                        <td className="px-2 py-2">{o.train_number ? <>{o.train_number} {o.train_name ?? ""} · <b className="text-destructive">{o.coach ?? "—"}/{o.seat ?? "—"}</b> · <span className="rounded border border-info px-1 text-info">{o.delivery_station ?? "—"}</span></> : "—"}</td>
                        <td className="tabular px-2 py-2 text-right font-bold">{formatINR(o.total)}</td>
                        <td className="px-2 py-2"><div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="size-7" aria-label="Print bill" onClick={() => printOrderBill(o.id).catch((e) => toast.error(e.message))}><Printer className="size-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="size-7" aria-label="Open" asChild><Link to="/orders/$id" params={{ id: o.id }}><Eye className="size-3.5" /></Link></Button>
                        </div></td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b bg-muted/20"><td colSpan={10} className="p-3">
                          <div className="grid gap-3 md:grid-cols-3">
                            <table className="w-full rounded border bg-card"><thead className="bg-muted"><tr><th className="px-2 py-1 text-left">Item</th><th className="px-2 py-1 text-right">Qty</th><th className="px-2 py-1 text-right">Amount</th></tr></thead>
                              <tbody>{its.length ? its.map((i) => <tr key={i.id}><td className="px-2 py-1">{i.name}</td><td className="px-2 py-1 text-right">{i.quantity}</td><td className="tabular px-2 py-1 text-right">{formatINR(Number(i.unit_price) * i.quantity)}</td></tr>) : <tr><td colSpan={3} className="px-2 py-1 text-muted-foreground">{items.isLoading ? "Loading…" : "Not provided"}</td></tr>}</tbody></table>
                            <div className="rounded border bg-card p-2"><div className="mb-1 font-semibold">Remarks</div><div className="text-muted-foreground">{o.instructions || "—"}</div><div className="mt-2 text-muted-foreground">Customer: {o.customer_name}{o.journey_date ? ` · Journey ${o.journey_date}` : ""}</div></div>
                            <div className="space-y-1 rounded border bg-card p-2">
                              {[["Sub total", o.subtotal], ["Tax / GST", o.tax], ["Delivery charge", o.delivery_fee], ["Discount", o.discount]].map(([l, v]) => <div key={l as string} className="flex justify-between"><span className="text-muted-foreground">{l}</span><span className="tabular">{formatINR(v as number)}</span></div>)}
                              <div className="flex justify-between rounded bg-primary px-2 py-1.5 text-sm font-bold text-primary-foreground"><span>{cod && o.payment_status !== "PAID" ? "Amount to collect" : "Total (paid online)"}</span><span className="tabular">{formatINR(o.total)}</span></div>
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2 text-xs">
            <span>Rows per page</span>
            <select className={sel} value={per} onChange={(e) => { setPer(+e.target.value); setPage(0); }}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>
            <span>{page * per + 1}–{Math.min(rows.length, (page + 1) * per)} of {rows.length}</span>
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * per >= rows.length} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </>
      )}
    </div>
  );
}
