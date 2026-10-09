import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatINR } from "@/lib/order-status";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { usePartners } from "@/lib/queries";
import { RoleGuard } from "@/components/app/Guard";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/_app/delivery-partners")({
  head: () => ({ meta: [{ title: "Delivery partners — RailFeasto Order Hub" }, { name: "description", content: "Manage delivery partners." }, { property: "og:title", content: "Delivery partners" }, { property: "og:description", content: "Manage delivery partners." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Partners /></RoleGuard>,
});

function Partners() {
  const { restaurantId } = useTenant();
  const q = usePartners(restaurantId);
  const qc = useQueryClient();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const stats = useQuery({
    queryKey: ["partner-stats", restaurantId, day], enabled: !!restaurantId,
    queryFn: async () => {
      const from = new Date(day + "T00:00:00"); const to = new Date(from); to.setDate(to.getDate() + 1);
      const { data, error } = await supabase.from("deliveries").select("partner_id, status, orders!inner(total, payment_method, status, created_at)")
        .eq("restaurant_id", restaurantId).gte("orders.created_at", from.toISOString()).lt("orders.created_at", to.toISOString());
      if (error) throw error;
      const m: Record<string, { delivered: number; pending: number; failed: number; cod: number; codTotal: number }> = {};
      for (const d of data ?? []) {
        if (!d.partner_id) continue;
        const o = d.orders as unknown as { total: number; payment_method: string; status: string };
        const r = (m[d.partner_id] ??= { delivered: 0, pending: 0, failed: 0, cod: 0, codTotal: 0 });
        if (o.status === "DELIVERED") r.delivered++; else if (o.status === "FAILED") r.failed++; else if (!["CANCELLED", "REFUNDED"].includes(o.status)) r.pending++;
        if (/cod|cash/i.test(o.payment_method) && o.status === "DELIVERED") { r.cod++; r.codTotal += Number(o.total); }
      }
      return m;
    },
  });
  const [f, setF] = useState({ name: "", phone: "", station: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["partners"] });
  const upd = async (id: string, patch: { available?: boolean; active?: boolean }) => {
    const { error } = await supabase.from("delivery_partners").update(patch).eq("id", id);
    if (error) toast.error(error.message); refresh();
  };
  return (
    <div>
      <PageHeader title="Delivery Executives" description="Daily deliveries and COD collected per executive. Inactive executives keep their history." />
      <form className="surface mb-4 flex flex-wrap gap-2 p-3" onSubmit={async (e) => {
        e.preventDefault();
        if (f.name.trim().length < 2) { toast.error("Enter a name"); return; }
        const { error } = await supabase.from("delivery_partners").insert({ restaurant_id: restaurantId, name: f.name.trim(), phone: f.phone || null, station: f.station || null });
        if (error) { toast.error(error.message); return; }
        setF({ name: "", phone: "", station: "" }); toast.success("Partner added"); refresh();
      }}>
        <Input className="w-44" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input className="w-36" placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input className="w-44" placeholder="Station" value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })} />
        <Button>Add partner</Button>
      </form>
      {q.isLoading ? <TableSkeleton /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <EmptyState title="No delivery partners yet" body="Add partners here, or invite delivery staff from Staff so they get their own app view." /> : (
        <>
        <div className="mb-2 flex items-center gap-2 text-xs"><span>Date</span><Input type="date" className="h-8 w-40" value={day} onChange={(e) => setDay(e.target.value)} /></div>
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[820px] text-xs">
            <thead className="bg-primary text-primary-foreground"><tr>{["Name", "Phone / station", "Delivered", "Pending", "Failed", "COD orders", "COD total", "Commission", "Available", "Active"].map((h) => <th key={h} className="px-2 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {q.data.map((p) => { const st = stats.data?.[p.id]; return (
                <tr key={p.id} className="hover:bg-muted/40">
                  <td className="px-2 py-2 font-semibold">{p.name}{p.user_id && <div className="text-[10px] font-normal text-muted-foreground">has app login</div>}</td>
                  <td className="px-2 py-2 text-muted-foreground">{p.phone ?? "—"} · {p.station ?? "Any"}</td>
                  <td className="tabular px-2 py-2">{st?.delivered ?? 0}</td>
                  <td className="tabular px-2 py-2">{st?.pending ?? 0}</td>
                  <td className="tabular px-2 py-2">{st?.failed ?? 0}</td>
                  <td className="tabular px-2 py-2">{st?.cod ?? 0}</td>
                  <td className="tabular px-2 py-2 font-semibold">{formatINR(st?.codTotal ?? 0)}</td>
                  <td className="tabular px-2 py-2">{formatINR(0)}</td>
                  <td className="px-2 py-2"><Switch checked={p.available} onCheckedChange={(v) => upd(p.id, { available: v })} /></td>
                  <td className="px-2 py-2"><Switch checked={p.active} onCheckedChange={(v) => upd(p.id, { active: v })} /></td>
                </tr>); })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
