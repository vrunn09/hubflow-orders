import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { downloadCsv } from "@/lib/queries";
import { RoleGuard } from "@/components/app/Guard";
import { PageHeader } from "@/components/app/states";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — RailFeasto Order Hub" }, { name: "description", content: "Download operational and financial reports." }, { property: "og:title", content: "Reports" }, { property: "og:description", content: "Download operational and financial reports." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Reports /></RoleGuard>,
});

type Kind = "daily" | "weekly" | "monthly" | "platform" | "payment" | "settlement" | "delivery" | "cancellation";
const REPORTS: { k: Kind; t: string; d: string }[] = [
  { k: "daily", t: "Daily report", d: "All orders placed today" }, { k: "weekly", t: "Weekly report", d: "Last 7 days of orders" },
  { k: "monthly", t: "Monthly report", d: "Last 30 days of orders" }, { k: "platform", t: "Platform report", d: "Orders & revenue per source, 30 days" },
  { k: "payment", t: "Payment report", d: "Transactions and verification, 30 days" }, { k: "settlement", t: "Settlement report", d: "Computed settlement lines" },
  { k: "delivery", t: "Delivery report", d: "Assignments and delivery times, 30 days" }, { k: "cancellation", t: "Cancellation report", d: "Cancelled, failed and refunded orders" },
];

function Reports() {
  const { restaurantId } = useTenant();
  const [busy, setBusy] = useState<Kind | null>(null);
  const since = (d: number) => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (d - 1)); return x.toISOString(); };

  async function gen(k: Kind) {
    setBusy(k);
    try {
      let rows: Record<string, unknown>[] = [];
      const orderCols = "order_number,external_order_id,source_key,customer_name,train_number,delivery_station,subtotal,tax,discount,delivery_fee,total,payment_method,payment_status,status,created_at";
      if (["daily", "weekly", "monthly"].includes(k)) {
        const { data, error } = await supabase.from("orders").select(orderCols).eq("restaurant_id", restaurantId).gte("created_at", since(k === "daily" ? 1 : k === "weekly" ? 7 : 30)).order("created_at");
        if (error) throw error; rows = data;
      } else if (k === "platform") {
        const { data } = await supabase.from("orders").select("source_key,total,status").eq("restaurant_id", restaurantId).gte("created_at", since(30));
        const m: Record<string, { platform: string; orders: number; revenue: number; cancelled: number }> = {};
        for (const o of data ?? []) { const x = (m[o.source_key] ??= { platform: o.source_key, orders: 0, revenue: 0, cancelled: 0 }); x.orders++; if (o.status === "CANCELLED") x.cancelled++; else x.revenue += Number(o.total); }
        rows = Object.values(m);
      } else if (k === "payment") {
        const { data } = await supabase.from("payments").select("method,mode,amount,status,provider_ref,verified_at,created_at,orders(order_number)").eq("restaurant_id", restaurantId).gte("created_at", since(30));
        rows = (data ?? []).map(({ orders, ...r }) => ({ order: (orders as { order_number: string } | null)?.order_number, ...r }));
      } else if (k === "settlement") {
        const { data } = await supabase.from("settlements").select("source_key,period_start,period_end,gross,discounts,commission,refunds,adjustments,net,status").eq("restaurant_id", restaurantId);
        rows = data ?? [];
      } else if (k === "delivery") {
        const { data } = await supabase.from("deliveries").select("status,assigned_at,picked_up_at,delivered_at,orders(order_number,delivery_station,train_number),delivery_partners(name)").eq("restaurant_id", restaurantId).gte("assigned_at", since(30));
        rows = (data ?? []).map((d) => ({ order: (d.orders as { order_number: string } | null)?.order_number, partner: (d.delivery_partners as { name: string } | null)?.name, status: d.status, assigned_at: d.assigned_at, picked_up_at: d.picked_up_at, delivered_at: d.delivered_at }));
      } else {
        const { data } = await supabase.from("orders").select(orderCols).eq("restaurant_id", restaurantId).in("status", ["CANCELLED", "FAILED", "REFUNDED"]).gte("created_at", since(90));
        rows = data ?? [];
      }
      if (!rows.length) toast.info("No data for this report yet");
      else { downloadCsv(`${k}-report-${new Date().toISOString().slice(0, 10)}.csv`, rows); toast.success("Report downloaded"); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Report failed"); }
    setBusy(null);
  }

  return (
    <div>
      <PageHeader title="Reports" description="Generated on demand from live data, exported as CSV." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {REPORTS.map((r) => (
          <div key={r.k} className="surface flex flex-col p-4">
            <FileText className="size-5 text-saffron" /><div className="mt-2 font-semibold">{r.t}</div><p className="text-xs text-muted-foreground">{r.d}</p>
            <Button size="sm" variant="outline" className="mt-4" disabled={busy === r.k} onClick={() => gen(r.k)}><Download />{busy === r.k ? "Generating…" : "Download CSV"}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
