import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Copy, FlaskConical, Info, Lock, Mail, Search } from "lucide-react";
import { useTenant } from "@/lib/tenant";
import { connectSource, syncSource, testSourceConnection } from "@/lib/api.functions";
import { CONNECTORS } from "@/lib/connectors/registry";
import { RoleGuard } from "@/components/app/Guard";
import { PageHeader } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/order-sources/connect")({
  validateSearch: z.object({ connector: z.string().optional() }),
  head: () => ({ meta: [{ title: "Connect a platform — RailFeasto Order Hub" }, { name: "description", content: "Connect a new order source." }, { property: "og:title", content: "Connect a platform" }, { property: "og:description", content: "Connect a new order source." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Wizard /></RoleGuard>,
});

const STEPS = ["Platform", "Method", "Configure", "Test", "Sync", "Connected"];

function Wizard() {
  const { restaurantId } = useTenant();
  const sp = Route.useSearch();
  const nav = useNavigate();
  const qc = useQueryClient();
  const connect = useServerFn(connectSource);
  const test = useServerFn(testSourceConnection);
  const sync = useServerFn(syncSource);
  const [key, setKey] = useState(sp.connector ?? "");
  const [step, setStep] = useState(sp.connector ? 1 : 0);
  const [env, setEnv] = useState<"mock" | "production">("mock");
  const c = CONNECTORS.find((x) => x.key === key);
  const [name, setName] = useState(c?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [result, setResult] = useState<{ sourceId: string; webhookSecret: string | null; webhookPath: string | null } | null>(null);
  const [search, setSearch] = useState("");
  const ql = search.trim().toLowerCase();
  const matches = CONNECTORS.filter((x) => x.key !== "manual" && (!ql || [x.name, x.key, ...(x.keywords ?? [])].some((w) => w.toLowerCase().includes(ql))));
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const guard = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } setBusy(false); };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Connect new platform" description="Choose platform → connection method → configure → test → sync." />
      <ol className="mb-6 flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => <li key={s} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", i === step ? "border-saffron bg-saffron-soft" : i < step ? "text-success" : "text-muted-foreground")}>{i < step && <Check className="mr-1 inline size-3" />}{s}</li>)}
      </ol>

      <div className="surface p-5">
        {step === 0 && (
          <div className="space-y-3">
            <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input autoFocus className="pl-8" placeholder="Search platform — IRCTC, Zomato, Swiggy, Zoop…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {matches.map((x) => (
                <button key={x.key} onClick={() => { setKey(x.key); setName(x.name); setStep(1); }} className="rounded-lg border p-3 text-left hover:border-saffron">
                  <div className="flex items-center gap-2 font-semibold">{x.name}{x.productionReady ? <span className="rounded bg-success-soft px-1.5 text-[10px] text-success">Live sync</span> : <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">Sync unavailable</span>}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{x.description}</div>
                </button>
              ))}
            </div>
            {matches.length === 0 && <p className="text-sm text-muted-foreground">No platform found. Choose “Any Platform (AI order reader)” to connect any other platform.</p>}
          </div>
        )}

        {step === 1 && c && (
          <div className="space-y-3">
            <h2 className="font-semibold">How should {c.name} connect?</h2>
            <label className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", env === "mock" && "border-saffron bg-saffron-soft/50")}>
              <input type="radio" checked={env === "mock"} onChange={() => setEnv("mock")} className="mt-1" />
              <div><div className="flex items-center gap-1.5 font-medium"><FlaskConical className="size-4" />Test mode (mock connector)</div><p className="text-xs text-muted-foreground">Generates realistic sample orders through the real pipeline. Clearly labelled “Test mode” everywhere. No external account is touched.</p></div>
            </label>
            <label className={cn("flex gap-3 rounded-lg border p-3", c.productionReady ? "cursor-pointer" : "opacity-60", env === "production" && "border-saffron bg-saffron-soft/50")}>
              <input type="radio" disabled={!c.productionReady} checked={env === "production"} onChange={() => setEnv("production")} className="mt-1" />
              <div><div className="flex items-center gap-1.5 font-medium"><Lock className="size-4" />Live — {c.methods.map((m) => m.replace("_", " ")).join(" / ")}</div><p className="text-xs text-muted-foreground">{c.productionNote}</p></div>
            </label>
            {c.key === "gmail" && <GmailPanel />}
            {!c.productionReady && c.key !== "gmail" && (
              <div className="flex gap-2 rounded-md bg-info-soft p-3 text-xs text-info"><Info className="size-4 shrink-0" />Merchant login with username/password is not supported: these platforms don't allow outside apps to sign in to merchant panels, and storing your password would put your account at risk. We never ask for your merchant password and never sign in to partner dashboards on your behalf. Live connections use only the official API or webhook access the platform grants you.</div>
            )}
            <div className="flex justify-between pt-2"><Button variant="ghost" onClick={() => setStep(0)}>Back</Button><Button onClick={() => setStep(2)}>Continue</Button></div>
          </div>
        )}

        {step === 2 && c && (
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Connection name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            {env === "production" && c.methods.includes("webhook") && <p className="text-sm text-muted-foreground">A unique signed webhook endpoint and secret will be generated. The secret is shown once and only its hash is stored.</p>}
            <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(1)}>Back</Button><Button disabled={name.length < 2} onClick={() => setStep(3)}>Continue</Button></div>
          </div>
        )}

        {step === 3 && c && (
          <div className="space-y-4">
            <p className="text-sm">Run a test payload through the {c.name} connector's validator and normalizer.</p>
            {testResult && <p className={cn("rounded-md px-3 py-2 text-sm", testResult.ok ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive")}>{testResult.ok ? "Connection test passed. " : "Connection failed: "}{testResult.message}</p>}
            <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy} onClick={() => guard(async () => setTestResult(await test({ data: { restaurantId, connectorKey: c.key } })))}>{busy ? "Testing…" : "Test connection"}</Button>
                <Button disabled={!testResult?.ok || busy} onClick={() => guard(async () => { const r = await connect({ data: { restaurantId, connectorKey: c.key, displayName: name, environment: env } }); setResult(r); qc.invalidateQueries({ queryKey: ["sources"] }); setStep(4); })}>Save connection</Button>
              </div></div>
          </div>
        )}

        {step === 4 && result && (
          <div className="space-y-4">
            {result.webhookSecret && c?.key === "gmail_forward" ? (
              <GmailScriptGuide url={`${window.location.origin}${result.webhookPath}`} secret={result.webhookSecret} />
            ) : result.webhookSecret ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Give these to the platform. The secret won't be shown again.</p>
                <Copyable label="Endpoint (POST)" value={`${window.location.origin}${result.webhookPath}`} />
                <Copyable label="Authorization header" value={`Bearer ${result.webhookSecret}`} />
              </div>
            ) : <p className="text-sm">Run a first sync to pull test orders into your hub.</p>}
            {syncMsg && <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">{syncMsg}</p>}
            <div className="flex justify-end gap-2">
              {env === "mock" && <Button variant="outline" disabled={busy} onClick={() => guard(async () => { const r = await sync({ data: { sourceId: result.sourceId } }); setSyncMsg(`${r.created} test order(s) received.`); })}>{busy ? "Syncing…" : "Sync now"}</Button>}
              <Button onClick={() => setStep(5)}>Finish</Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="py-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success"><Check /></div>
            <h2 className="mt-3 text-lg font-bold">{name} is connected{env === "mock" && " in test mode"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">New orders will appear on your dashboard and kitchen display instantly.</p>
            <div className="mt-5 flex justify-center gap-2"><Button variant="outline" asChild><Link to="/order-sources">All sources</Link></Button><Button variant="saffron" onClick={() => nav({ to: "/dashboard" })}>Go to dashboard</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}

function GmailPanel() {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 font-semibold"><Mail className="size-4" />Connect Google / Gmail</div>
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Connected account</dt><dd>—</dd>
        <dt className="text-muted-foreground">Status</dt><dd>Not connected</dd>
        <dt className="text-muted-foreground">Last sync</dt><dd>Never</dd>
      </dl>
      <Button className="mt-3" variant="outline" disabled>Connect Google Account</Button>
      <p className="mt-2 text-xs text-muted-foreground">Live Gmail uses Google sign-in with read-only mail permission — your Google password is never seen or stored. A Google OAuth app must be set up for this workspace before this button activates. Use test mode meanwhile.</p>
    </div>
  );
}

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div><div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex gap-2"><code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">{value}</code>
        <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }} aria-label="Copy"><Copy /></Button></div></div>
  );
}
