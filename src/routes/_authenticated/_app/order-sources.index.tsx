import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Pause, Play, Plus, RefreshCw, Unplug } from "lucide-react";
import { GmailCard } from "@/components/app/GmailCard";
import { CredentialsDialog } from "@/components/app/CredentialsDialog";
import { useTenant } from "@/lib/tenant";
import { useSources } from "@/lib/queries";
import { sourceAction, syncSource } from "@/lib/api.functions";
import { CONNECTORS } from "@/lib/connectors/registry";
import { RoleGuard } from "@/components/app/Guard";
import { CardsSkeleton, ErrorState, PageHeader } from "@/components/app/states";
import { EnvTag, Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/_app/order-sources/")({
  head: () => ({ meta: [{ title: "Order sources — RailFeasto Order Hub" }, { name: "description", content: "Manage connected order sources." }, { property: "og:title", content: "Order sources" }, { property: "og:description", content: "Manage connected order sources." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><Sources /></RoleGuard>,
});

function Sources() {
  const { restaurantId, can } = useTenant();
  const q = useSources(restaurantId);
  const qc = useQueryClient();
  const sync = useServerFn(syncSource);
  const act = useServerFn(sourceAction);
  const [busy, setBusy] = useState<string | null>(null);
  const [disc, setDisc] = useState<string | null>(null);
  const [cred, setCred] = useState<{ id: string; name: string } | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, msg: (r: unknown) => string) => {
    setBusy(id);
    try { const r = await fn(); toast.success(msg(r)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
    setBusy(null); qc.invalidateQueries({ queryKey: ["sources"] });
  };

  const connectedKeys = new Set((q.data ?? []).filter((s) => s.status !== "not_connected").map((s) => s.connector_key));

  return (
    <div>
      <PageHeader title="Order sources" description="Each source runs through its own connector into the same order pipeline."
        actions={<Button variant="saffron" asChild><Link to="/order-sources/connect"><Plus />Connect new platform</Link></Button>} />
      <GmailCard />
      {q.isLoading ? <CardsSkeleton n={6} /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {q.data!.map((s) => {
              const c = CONNECTORS.find((x) => x.key === s.connector_key);
              const isSync = busy === s.id || s.status === "syncing";
              return (
                <div key={s.id} className="surface flex flex-col p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold">{s.display_name}</div><div className="text-xs text-muted-foreground">{c?.name}</div></div>
                    <EnvTag env={s.environment} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2"><Pill value={isSync ? "syncing" : s.status} label={isSync ? "Syncing…" : s.status === "connected" ? "Connected" : s.status === "not_connected" ? "Not connected" : s.status} />
                    <span className={`text-xs font-medium ${s.health === "healthy" ? "text-success" : s.health === "degraded" ? "text-warning" : s.health === "down" ? "text-destructive" : "text-muted-foreground"}`}>Health: {s.health}</span></div>
                  <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Last sync</dt><dd className="text-right">{s.last_sync_at ? new Date(s.last_sync_at).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "Never"}</dd>
                    <dt className="text-muted-foreground">Orders received</dt><dd className="tabular text-right font-semibold">{s.orders_received}</dd>
                    {s.connected_account && <><dt className="text-muted-foreground">Account</dt><dd className="truncate text-right">{s.connected_account}</dd></>}
                  </dl>
                  {s.last_error && <p className="mt-2 rounded bg-destructive-soft px-2 py-1 text-xs text-destructive">{s.last_error}</p>}
                  {s.status === "error" && <p className="mt-2 text-xs font-medium text-destructive">Connection failed — reconnect to resume.</p>}
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    {s.status === "connected" && s.connector_key !== "manual" && s.connector_key !== "gmail_api" && <Button size="sm" variant="outline" disabled={isSync} onClick={() => run(s.id, () => sync({ data: { sourceId: s.id } }), (r) => { const x = r as { created: number; duplicates: number; failed: number }; return `Synced: ${x.created} new, ${x.duplicates} duplicate, ${x.failed} failed`; })}><RefreshCw className={isSync ? "animate-spin" : ""} />Sync now</Button>}
                    {s.status === "connected" && s.connector_key !== "manual" && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run(s.id, () => act({ data: { sourceId: s.id, action: "pause" } }), () => "Source paused")}><Pause />Pause</Button>}
                    {s.status === "paused" && <Button size="sm" variant="outline" onClick={() => run(s.id, () => act({ data: { sourceId: s.id, action: "resume" } }), () => "Source resumed")}><Play />Resume</Button>}
                    {s.status === "error" && <Button size="sm" variant="saffron" onClick={() => run(s.id, () => act({ data: { sourceId: s.id, action: "reconnect" } }), () => "Reconnected")}>Reconnect</Button>}
                    {s.status === "not_connected" && <Button size="sm" variant="saffron" asChild><Link to="/order-sources/connect" search={{ connector: s.connector_key }}>Connect</Link></Button>}
                    {s.connector_key !== "manual" && s.connector_key !== "gmail_api" && s.status !== "not_connected" && <Button size="sm" variant="outline" onClick={() => setCred({ id: s.id, name: s.display_name })}><KeyRound />Change password</Button>}
                    {s.connector_key !== "manual" && s.connector_key !== "gmail_api" && s.status !== "not_connected" && can("owner") && <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => setDisc(s.id)}><Unplug />Disconnect</Button>}
                  </div>
                </div>
              );
            })}
          </div>
          <h2 className="mb-3 mt-8 text-sm font-semibold">Available connectors</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CONNECTORS.filter((c) => !connectedKeys.has(c.key) && c.key !== "gmail_api" && c.key !== "manual" && c.productionReady).map((c) => (
              <Link key={c.key} to="/order-sources/connect" search={{ connector: c.key }} className="surface flex items-center gap-3 p-3 hover:border-saffron/50">
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{c.name}</div><div className="truncate text-xs text-muted-foreground">{c.description}</div></div>
                <Pill value="not_connected" label="Not connected" />
              </Link>
            ))}
          </div>
        </>
      )}
      {cred && <CredentialsDialog sourceId={cred.id} name={cred.name} open onOpenChange={(v) => !v && setCred(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["sources"] })} />}
      <AlertDialog open={!!disc} onOpenChange={(v) => !v && setDisc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Disconnect this source?</AlertDialogTitle><AlertDialogDescription>New orders from it will stop arriving and its stored credentials are deleted. Existing orders stay.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => disc && run(disc, () => act({ data: { sourceId: disc, action: "disconnect" } }), () => "Disconnected")}>Disconnect</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
