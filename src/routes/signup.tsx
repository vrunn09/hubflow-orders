import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [
    { title: "Create account — RailFeasto Order Hub" }, { name: "description", content: "Set up your restaurant on RailFeasto Order Hub." },
    { property: "og:title", content: "Create account — RailFeasto Order Hub" }, { property: "og:description", content: "Set up your restaurant on RailFeasto Order Hub." },
  ] }),
  component: Signup,
});

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").regex(/[0-9]/, "Include a number").regex(/[A-Za-z]/, "Include a letter"),
});

function Signup() {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) return (
    <AuthLayout title="Verify your email" subtitle={`We sent a verification link to ${f.email}.`}>
      <div className="surface flex gap-3 p-4 text-sm"><MailCheck className="size-5 shrink-0 text-success" />Open the link to activate your account, then sign in to set up your restaurant.</div>
      <Button asChild variant="outline" className="mt-4 w-full"><Link to="/login">Back to sign in</Link></Button>
    </AuthLayout>
  );

  return (
    <AuthLayout title="Create your account" subtitle="You'll set up your restaurant next."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-foreground hover:underline">Sign in</Link></>}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setErr(null);
        const p = schema.safeParse(f);
        if (!p.success) return setErr(p.error.issues[0].message);
        setBusy(true);
        const { error } = await supabase.auth.signUp({
          email: p.data.email, password: p.data.password,
          options: { data: { full_name: p.data.name }, emailRedirectTo: `${window.location.origin}/login` },
        });
        setBusy(false);
        if (error) return setErr(error.message);
        setSent(true);
      }}>
        <div className="space-y-1.5"><Label htmlFor="n">Full name</Label><Input id="n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="e">Work email</Label><Input id="e" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="p">Password</Label><Input id="p" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <p className="text-xs text-muted-foreground">At least 8 characters with a letter and a number.</p></div>
        {err && <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{err}</p>}
        <Button className="w-full" variant="saffron" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <GoogleButton />
    </AuthLayout>
  );
}
