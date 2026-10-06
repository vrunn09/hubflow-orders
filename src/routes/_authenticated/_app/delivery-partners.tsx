import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
  const [f, setF] = useState({ name: "", phone: "", station: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["partners"] });
  const upd = async (id: string, patch: { available?: boolean; active?: boolean }) => {
    const { error } = await supabase.from("delivery_partners").update(patch).eq("id", id);
    if (error) toast.error(error.message); refresh();
  };
  return (
    <div>
      <PageHeader title="Delivery partners" description="Availability is used when assigning orders." />
      <form className="surface mb-4 flex flex-wrap gap-2 p-3" onSubmit={async (e) => {
        e.preventDefault();
        if (f.name.trim().length < 2) return toast.error("Enter a name");
        const { error } = await supabase.from("delivery_partners").insert({ restaurant_id: restaurantId, name: f.name.trim(), phone: f.phone || null, station: f.station || null });
        if (error) return toast.error(error.message);
        setF({ name: "", phone: "", station: "" }); toast.success("Partner added"); refresh();
      }}>
        <Input className="w-44" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input className="w-36" placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input className="w-44" placeholder="Station" value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })} />
        <Button>Add partner</Button>
      </form>
      {q.isLoading ? <TableSkeleton /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <EmptyState title="No delivery partners yet" body="Add partners here, or invite delivery staff from Staff so they get their own app view." /> : (
        <div className="surface divide-y">
          {q.data.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-40 flex-1"><div className="font-semibold">{p.name}</div><div className="text-xs text-muted-foreground">{p.phone ?? "—"} · {p.station ?? "Any station"}{p.user_id ? " · has app login" : ""}</div></div>
              <label className="flex items-center gap-2 text-xs">Available<Switch checked={p.available} onCheckedChange={(v) => upd(p.id, { available: v })} /></label>
              <label className="flex items-center gap-2 text-xs">Active<Switch checked={p.active} onCheckedChange={(v) => upd(p.id, { active: v })} /></label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
