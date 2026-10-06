import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { RoleGuard } from "@/components/app/Guard";
import { PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — RailFeasto Order Hub" }, { name: "description", content: "Restaurant settings." }, { property: "og:title", content: "Settings" }, { property: "og:description", content: "Restaurant settings." }] }),
  component: () => <RoleGuard roles={["owner"]}><Settings /></RoleGuard>,
});

function Settings() {
  const { restaurantId } = useTenant();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["restaurant", restaurantId], queryFn: async () => (await supabase.from("restaurants").select("*").eq("id", restaurantId).single()).data });
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "", gstin: "", logo_url: "", stations: "" });
  useEffect(() => { const r = q.data; if (r) setF({ name: r.name, phone: r.phone ?? "", email: r.email ?? "", address: r.address ?? "", gstin: r.gstin ?? "", logo_url: r.logo_url ?? "", stations: r.stations.join(", ") }); }, [q.data]);
  if (q.isLoading) return <TableSkeleton />;
  const bank = (q.data?.bank_details ?? {}) as Record<string, string>;
  const s = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Restaurant settings" />
      <form className="surface space-y-3 p-5" onSubmit={async (e) => {
        e.preventDefault();
        if (f.name.trim().length < 2) { toast.error("Name is required"); return; }
        const { error } = await supabase.from("restaurants").update({ ...f, gstin: f.gstin.toUpperCase(), stations: f.stations.split(",").map((x) => x.trim()).filter(Boolean), updated_at: new Date().toISOString() }).eq("id", restaurantId);
        if (error) { toast.error(error.message); return; }
        toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["memberships"] });
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Name</Label><Input value={f.name} onChange={s("name")} /></div>
          <div className="space-y-1.5"><Label>GSTIN</Label><Input value={f.gstin} onChange={s("gstin")} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={f.phone} onChange={s("phone")} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={f.email} onChange={s("email")} /></div>
        </div>
        <div className="space-y-1.5"><Label>Address</Label><Textarea rows={2} value={f.address} onChange={s("address")} /></div>
        <div className="space-y-1.5"><Label>Logo URL</Label><Input value={f.logo_url} onChange={s("logo_url")} /></div>
        <div className="space-y-1.5"><Label>Delivery stations</Label><Textarea rows={2} value={f.stations} onChange={s("stations")} /></div>
        <Button>Save changes</Button>
      </form>
      <div className="surface mt-4 p-5 text-sm">
        <h2 className="font-semibold">Settlement account</h2>
        <p className="mt-1 text-muted-foreground">{bank["account_name"] || "Not set"} · ••••{bank["account_last4"] || "----"} · {bank["ifsc"] || "IFSC not set"}{bank["upi"] && ` · ${bank["upi"]}`}</p>
      </div>
    </div>
  );
}
