import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [
    { title: "Set up your restaurant — RailFeasto Order Hub" }, { name: "description", content: "Restaurant onboarding." },
    { property: "og:title", content: "Set up your restaurant" }, { property: "og:description", content: "Restaurant onboarding." },
  ] }),
  component: Onboarding,
});

const STEPS = ["Restaurant", "Hours", "Settlement", "Delivery areas", "Order sources"];
const gstRe = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function Onboarding() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    name: "", logo_url: "", owner_name: (user.user_metadata?.full_name as string) ?? "", phone: "", email: user.email ?? "", address: "", gstin: "",
    open: "07:00", close: "23:00", days: "Mon–Sun",
    acct_name: "", acct_last4: "", ifsc: "", upi: "",
    stations: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const validate = () => {
    if (step === 0) {
      const r = z.object({ name: z.string().min(2, "Restaurant name is required"), phone: z.string().regex(/^[0-9+\-\s]{10,15}$/, "Enter a valid phone"), email: z.string().email("Enter a valid email") }).safeParse(f);
      if (!r.success) return r.error.issues[0].message;
      if (f.gstin && !gstRe.test(f.gstin.toUpperCase())) return "GSTIN format looks invalid";
      if (f.logo_url && !/^https:\/\//.test(f.logo_url)) return "Logo must be an https:// image URL";
    }
    if (step === 2 && f.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc.toUpperCase())) return "IFSC format looks invalid";
    if (step === 2 && f.acct_last4 && !/^\d{4}$/.test(f.acct_last4)) return "Enter only the last 4 digits";
    return null;
  };

  async function finish(goConnect: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("create_restaurant", {
      _name: f.name.trim(), _owner_name: f.owner_name, _phone: f.phone, _email: f.email, _address: f.address,
      _gstin: f.gstin.toUpperCase() || "", _logo_url: f.logo_url || "",
      _hours: { open: f.open, close: f.close, days: f.days },
      _bank: { account_name: f.acct_name, account_last4: f.acct_last4, ifsc: f.ifsc.toUpperCase(), upi: f.upi },
      _stations: f.stations.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setBusy(false);
    if (error) return setErr(error.message);
    await qc.invalidateQueries({ queryKey: ["memberships"] });
    toast.success("Restaurant created");
    nav({ to: goConnect ? "/order-sources/connect" : "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-5 py-4"><Logo /></header>
      <div className="mx-auto max-w-2xl px-5 py-8">
        <ol className="mb-8 flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              i === step ? "border-saffron bg-saffron-soft text-saffron-foreground" : i < step ? "text-success" : "text-muted-foreground")}>
              {i < step ? <Check className="size-3" /> : <span className="tabular">{i + 1}</span>}{s}
            </li>
          ))}
        </ol>
        <div className="surface space-y-4 p-5 sm:p-6">
          {step === 0 && (<>
            <h2 className="text-lg font-bold">Tell us about your restaurant</h2>
            <F l="Restaurant name *"><Input value={f.name} onChange={set("name")} /></F>
            <div className="grid gap-4 sm:grid-cols-2">
              <F l="Owner name"><Input value={f.owner_name} onChange={set("owner_name")} /></F>
              <F l="Phone *"><Input value={f.phone} onChange={set("phone")} inputMode="tel" /></F>
              <F l="Business email *"><Input value={f.email} onChange={set("email")} type="email" /></F>
              <F l="GSTIN"><Input value={f.gstin} onChange={set("gstin")} placeholder="22AAAAA0000A1Z5" /></F>
            </div>
            <F l="Address"><Textarea value={f.address} onChange={set("address")} rows={2} /></F>
            <F l="Logo URL"><Input value={f.logo_url} onChange={set("logo_url")} placeholder="https://…" /></F>
          </>)}
          {step === 1 && (<>
            <h2 className="text-lg font-bold">Operating hours</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <F l="Opens"><Input type="time" value={f.open} onChange={set("open")} /></F>
              <F l="Closes"><Input type="time" value={f.close} onChange={set("close")} /></F>
              <F l="Days"><Input value={f.days} onChange={set("days")} /></F>
            </div>
          </>)}
          {step === 2 && (<>
            <h2 className="text-lg font-bold">Settlement account</h2>
            <p className="text-sm text-muted-foreground">We store only a masked reference. Full account details are verified by the payout provider when payouts are enabled.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <F l="Account holder"><Input value={f.acct_name} onChange={set("acct_name")} /></F>
              <F l="Account number (last 4)"><Input value={f.acct_last4} onChange={set("acct_last4")} maxLength={4} inputMode="numeric" /></F>
              <F l="IFSC"><Input value={f.ifsc} onChange={set("ifsc")} /></F>
              <F l="UPI ID"><Input value={f.upi} onChange={set("upi")} /></F>
            </div>
          </>)}
          {step === 3 && (<>
            <h2 className="text-lg font-bold">Delivery stations & areas</h2>
            <F l="Stations (comma separated)"><Textarea rows={3} value={f.stations} onChange={set("stations")} placeholder="Bhopal Jn (BPL), Itarsi Jn (ET), Rani Kamlapati (RKMP)" /></F>
          </>)}
          {step === 4 && (<>
            <h2 className="text-lg font-bold">Connect your order sources</h2>
            <p className="text-sm text-muted-foreground">Direct / manual orders are ready to use. You can connect RailFeasto, Gmail and other platforms now or any time later from Order Sources.</p>
          </>)}
          {err && <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{err}</p>}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" disabled={step === 0 || busy} onClick={() => { setErr(null); setStep(step - 1); }}>Back</Button>
            {step < 4 ? (
              <Button onClick={() => { const e = validate(); setErr(e); if (!e) setStep(step + 1); }}>Continue</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy} onClick={() => finish(false)}>Skip for now</Button>
                <Button variant="saffron" disabled={busy} onClick={() => finish(true)}>{busy ? "Creating…" : "Connect sources"}</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function F({ l, children }: { l: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{l}</Label>{children}</div>;
}
