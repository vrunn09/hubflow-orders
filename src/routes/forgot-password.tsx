import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [
    { title: "Reset password — RailFeasto Order Hub" }, { name: "description", content: "Reset your Order Hub password." },
    { property: "og:title", content: "Reset password — RailFeasto Order Hub" }, { property: "og:description", content: "Reset your Order Hub password." },
  ] }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  return (
    <AuthLayout title="Forgot your password?" subtitle="We'll email you a secure reset link."
      footer={<Link to="/login" className="hover:text-foreground">← Back to sign in</Link>}>
      {state === "sent" ? (
        <p className="surface p-4 text-sm">If an account exists for <b>{email}</b>, a reset link is on its way.</p>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setState("busy"); setErr(null);
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
          if (error) { setErr(error.message); setState("idle"); } else setState("sent");
        }}>
          <div className="space-y-1.5"><Label htmlFor="e">Email</Label><Input id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {err && <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{err}</p>}
          <Button className="w-full" disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Send reset link"}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
