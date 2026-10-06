import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { PageHeader } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — RailFeasto Order Hub" }, { name: "description", content: "Your account." }, { property: "og:title", content: "Profile" }, { property: "og:description", content: "Your account." }] }),
  component: Profile,
});

function Profile() {
  const { user, role } = useTenant();
  const q = useQuery({ queryKey: ["profile", user.id], queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()).data });
  const [f, setF] = useState({ full_name: "", phone: "" });
  const [pw, setPw] = useState("");
  useEffect(() => { if (q.data) setF({ full_name: q.data.full_name ?? "", phone: q.data.phone ?? "" }); }, [q.data]);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Profile" description={`${user.email} · ${role}`} />
      <form className="surface space-y-3 p-5" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.from("profiles").upsert({ id: user.id, email: user.email ?? null, ...f });
        error ? toast.error(error.message) : toast.success("Profile saved");
      }}>
        <div className="space-y-1.5"><Label>Full name</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <Button>Save</Button>
      </form>
      <form className="surface space-y-3 p-5" onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 8) { toast.error("Use at least 8 characters"); return; }
        const { error } = await supabase.auth.updateUser({ password: pw });
        if (error) toast.error(error.message); else { toast.success("Password changed"); setPw(""); }
      }}>
        <h2 className="font-semibold">Change password</h2>
        <Input type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button variant="outline">Update password</Button>
      </form>
    </div>
  );
}
