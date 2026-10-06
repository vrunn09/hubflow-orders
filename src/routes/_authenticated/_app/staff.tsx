import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { inviteStaff, updateStaff } from "@/lib/api.functions";
import { RoleGuard } from "@/components/app/Guard";
import { ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/_app/staff")({
  head: () => ({ meta: [{ title: "Staff — RailFeasto Order Hub" }, { name: "description", content: "Manage staff, roles and access." }, { property: "og:title", content: "Staff" }, { property: "og:description", content: "Manage staff, roles and access." }] }),
  component: () => <RoleGuard roles={["owner"]}><Staff /></RoleGuard>,
});

const PERMS: Record<string, string> = {
  owner: "Everything, including staff, settings, refunds and disconnecting sources",
  manager: "Orders, kitchen, delivery, sources, payments, settlements, reports",
  kitchen: "Kitchen display only — no prices or customer contact",
  delivery: "Own assigned deliveries: station, train, coach, seat, instructions",
};

function Staff() {
  const { restaurantId, user } = useTenant();
  const invite = useServerFn(inviteStaff);
  const update = useServerFn(updateStaff);
  const [f, setF] = useState({ name: "", email: "", role: "kitchen" as "manager" | "kitchen" | "delivery" });
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["staff", restaurantId],
    queryFn: async () => { const { data, error } = await supabase.from("restaurant_members").select("*").eq("restaurant_id", restaurantId).order("created_at"); if (error) throw error; return data; },
  });
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); q.refetch(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } };

  return (
    <div>
      <PageHeader title="Staff" description="Invited people get access as soon as they sign up or sign in with that email." />
      <form className="surface mb-4 flex flex-wrap gap-2 p-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        await act(async () => { const r = await invite({ data: { restaurantId, ...f } }); setF({ ...f, name: "", email: "" }); return r; }, "Staff added");
        setBusy(false);
      }}>
        <Input className="w-44" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input className="w-56" type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as typeof f.role })}>
          <option value="manager">Manager</option><option value="kitchen">Kitchen staff</option><option value="delivery">Delivery staff</option></select>
        <Button disabled={busy}>Add staff</Button>
      </form>
      {q.isLoading ? <TableSkeleton /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="surface divide-y">
          {q.data!.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-48 flex-1">
                <div className="font-semibold">{m.display_name ?? m.invited_email ?? "Owner"}{m.user_id === user.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</div>
                <div className="text-xs text-muted-foreground">{m.invited_email}{!m.user_id && " · invite pending"}</div>
                <div className="text-[11px] text-muted-foreground">{PERMS[m.role]}</div>
              </div>
              {m.role === "owner" ? <span className="text-xs font-bold uppercase text-saffron">Owner</span> : (<>
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value={m.role} onChange={(e) => act(() => update({ data: { memberId: m.id, role: e.target.value as "manager" } }), "Role updated")}>
                  <option value="manager">Manager</option><option value="kitchen">Kitchen</option><option value="delivery">Delivery</option></select>
                <label className="flex items-center gap-1.5 text-xs">Active<Switch checked={m.active} onCheckedChange={(v) => act(() => update({ data: { memberId: m.id, active: v } }), v ? "Activated" : "Deactivated")} /></label>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm("Remove this person?") && act(() => update({ data: { memberId: m.id, remove: true } }), "Removed")}>Remove</Button>
              </>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
