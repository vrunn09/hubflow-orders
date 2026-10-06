import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Set new password — RailFeasto Order Hub" }, { name: "description", content: "Choose a new password." },
    { property: "og:title", content: "Set new password — RailFeasto Order Hub" }, { property: "og:description", content: "Choose a new password." },
  ] }),
  component: Reset,
});

function Reset() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <AuthLayout title="Set a new password">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 8) return setErr("Use at least 8 characters");
        setBusy(true);
        const { error } = await supabase.auth.updateUser({ password: pw });
        setBusy(false);
        if (error) return setErr(error.message);
        toast.success("Password updated");
        nav({ to: "/dashboard" });
      }}>
        <div className="space-y-1.5"><Label htmlFor="p">New password</Label><Input id="p" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {err && <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{err}</p>}
        <Button className="w-full" disabled={busy}>Update password</Button>
      </form>
    </AuthLayout>
  );
}
