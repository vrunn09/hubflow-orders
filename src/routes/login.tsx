import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "Sign in — RailFeasto Order Hub" }, { name: "description", content: "Sign in to your restaurant's order hub." },
    { property: "og:title", content: "Sign in — RailFeasto Order Hub" }, { property: "og:description", content: "Sign in to your restaurant's order hub." },
  ] }),
  component: Login,
});

export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={async () => {
      setBusy(true);
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/login" });
      if (r.error) { toast.error(r.error.message ?? "Google sign-in failed"); setBusy(false); }
    }}>
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden><path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.5-1.68 4.4-5.35 4.4-3.22 0-5.85-2.67-5.85-5.96S8.78 6.56 12 6.56c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 4 14.55 3 12 3 6.98 3 2.9 7.03 2.9 12s4.08 9 9.1 9c5.25 0 8.73-3.69 8.73-8.89 0-.6-.07-1.05-.15-1.51z" /></svg>
      {label}
    </Button>
  );
}

function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Already signed in (e.g. returning from Google) → go to app.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && nav({ to: "/dashboard" }));
  }, [nav]);

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to manage today's orders."
      footer={<>New here? <Link to="/signup" className="font-semibold text-foreground underline-offset-4 hover:underline">Create an account</Link></>}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setBusy(false);
        if (error) return setErr(error.message === "Email not confirmed" ? "Please verify your email first — check your inbox for the link." : error.message);
        nav({ to: "/dashboard" });
      }}>
        <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1.5">
          <div className="flex justify-between"><Label htmlFor="pw">Password</Label><Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">Forgot password?</Link></div>
          <Input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{err}</p>}
        <Button className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <GoogleButton />
    </AuthLayout>
  );
}
