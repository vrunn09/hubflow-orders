import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { completeGmailConnect, disconnectGmail, gmailStatus, ignoreImportedEmail, startGmailConnect, syncGmailNow } from "@/lib/gmail.functions";
import { Button } from "@/components/ui/button";

function waitForCode(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    const cleanup = () => { window.removeEventListener("message", onMsg); clearInterval(poll); };
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type;
      if (e.origin !== window.location.origin || e.source !== popup || e.data?.connectorId !== "google_mail") return;
      if (t !== "appUserConnectorOAuthComplete" && t !== "appUserConnectorOAuthFailed") return;
      cleanup();
      if (t === "appUserConnectorOAuthComplete") resolve(typeof e.data.code === "string" ? e.data.code : null);
      else reject(new Error(e.data?.error ? `Google permission failed: ${e.data.error}` : "Google permission was not granted."));
    };
    window.addEventListener("message", onMsg);
    const poll = window.setInterval(() => { if (popup.closed) { cleanup(); reject(new Error("Google window closed before permission was given.")); } }, 500);
  });
}

const ago = (d: string | null) => {
  if (!d) return "Never";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(d).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
};

export function GmailCard() {
  const { restaurantId } = useTenant();
  const qc = useQueryClient();
  const status = useServerFn(gmailStatus);
  const start = useServerFn(startGmailConnect);
  const complete = useServerFn(completeGmailConnect);
  const sync = useServerFn(syncGmailNow);
  const disc = useServerFn(disconnectGmail);
  const ignore = useServerFn(ignoreImportedEmail);
  const [busy, setBusy] = useState<null | "connect" | "sync" | "disc">(null);
  const q = useQuery({ queryKey: ["gmail", restaurantId], enabled: !!restaurantId, refetchInterval: 30_000, queryFn: () => status({ data: { restaurantId } }) });
  const review = useQuery({
    queryKey: ["gmail-review", restaurantId], enabled: !!q.data?.account, refetchInterval: 60_000,
    queryFn: async () => (await supabase.from("imported_emails").select("id, sender, subject, received_at, platform, snippet")
      .eq("restaurant_id", restaurantId).eq("processing_status", "needs_review").order("created_at", { ascending: false }).limit(10)).data ?? [],
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["gmail"] }); qc.invalidateQueries({ queryKey: ["gmail-review"] }); qc.invalidateQueries({ queryKey: ["sources"] }); };

  const connect = async () => {
    const popup = window.open("", "gmail-oauth", "width=520,height=680");
    if (!popup) return toast.error("Popup blocked — please allow popups and try again.");
    setBusy("connect");
    try {
      const { authorizationUrl } = await start({ data: { restaurantId } });
      const done = waitForCode(popup);
      popup.location.href = authorizationUrl;
      const code = await done;
      if (code) { const r = await complete({ data: { restaurantId, code } }); toast.success(`Gmail connected: ${r.email ?? ""}`); }
      refresh();
      sync({ data: { restaurantId } }).then(refresh).catch(() => {});
    } catch (e) { popup.close(); toast.error(e instanceof Error ? e.message : "Could not connect Gmail"); }
    setBusy(null);
  };

  const a = q.data?.account;
  const expired = a?.connection_status === "reconnect_required";
  return (
    <div className="surface mb-6 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-saffron-soft text-saffron"><Mail className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-semibold">Gmail
            {a && !expired && <span className="rounded bg-success-soft px-1.5 text-[11px] text-success">Connected</span>}
            {expired && <span className="rounded bg-destructive-soft px-1.5 text-[11px] text-destructive">Access expired</span>}
          </div>
          <p className="text-sm text-muted-foreground">{a ? a.email_address : "Connect your restaurant's Gmail — food order emails will appear on the dashboard automatically."}</p>
        </div>
      </div>

      {q.isLoading ? <div className="mt-4 h-9 animate-pulse rounded bg-muted" /> : !a ? (
        <div className="mt-4 space-y-3">
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex gap-1.5"><ShieldCheck className="size-3.5 shrink-0 text-success" />Google ka official sign-in — password kabhi nahi maanga jaata.</li>
            <li className="flex gap-1.5"><ShieldCheck className="size-3.5 shrink-0 text-success" />Sirf padhne ki permission (read-only). Hum email bhej, mita ya badal nahi sakte.</li>
            <li className="flex gap-1.5"><ShieldCheck className="size-3.5 shrink-0 text-success" />Sirf food order emails process hote hain; baaki emails ignore.</li>
          </ul>
          {q.data?.configured === false ? <p className="text-sm text-destructive">Gmail connection is not set up yet.</p> :
            <Button variant="saffron" disabled={busy === "connect"} onClick={connect}><Mail />{busy === "connect" ? "Waiting for Google…" : "Connect Gmail"}</Button>}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {expired && <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">Gmail access needs to be renewed. New orders are paused until you reconnect.</p>}
          {a.last_error && !expired && <p className="rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive">{a.last_error}</p>}
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground">Last checked</dt><dd className="text-sm font-semibold">{ago(a.last_checked_at)}</dd></div>
            <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground">Orders today</dt><dd className="tabular text-sm font-semibold">{q.data?.ordersToday}</dd></div>
            <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground">Emails checked</dt><dd className="tabular text-sm font-semibold">{a.emails_processed}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {expired ? <Button variant="saffron" disabled={busy === "connect"} onClick={connect}>Reconnect Gmail</Button> :
              <Button variant="outline" disabled={busy === "sync"} onClick={async () => {
                setBusy("sync");
                try { const r = await sync({ data: { restaurantId } }); toast.success(r.reconnectRequired ? "Gmail access expired — please reconnect" : `Checked ${r.checked} new email(s): ${r.imported} order(s) imported, ${r.needsReview} need review`); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Sync failed"); }
                setBusy(null); refresh();
              }}><RefreshCw className={busy === "sync" ? "animate-spin" : ""} />{busy === "sync" ? "Checking Gmail…" : "Sync now"}</Button>}
            <Button variant="ghost" className="ml-auto text-destructive" disabled={busy === "disc"} onClick={async () => {
              if (!confirm("Disconnect Gmail? New email orders will stop. Existing orders stay.")) return;
              setBusy("disc"); try { await disc({ data: { restaurantId } }); toast.success("Gmail disconnected"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              setBusy(null); refresh();
            }}><Unplug />Disconnect</Button>
          </div>
          {!!review.data?.length && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Needs review</h3>
              <p className="mb-2 text-xs text-muted-foreground">We detected a possible food order, but some information could not be reliably extracted.</p>
              <ul className="space-y-2">
                {review.data.map((m) => (
                  <li key={m.id} className="rounded-md border p-2 text-xs">
                    <div className="font-medium">{m.subject || "(no subject)"}</div>
                    <div className="text-muted-foreground">{m.sender} · Source: {m.platform === "UNKNOWN" ? "Unknown / Other" : m.platform} · {ago(m.received_at)}</div>
                    {m.snippet && <p className="mt-1 line-clamp-2">{m.snippet}</p>}
                    <div className="mt-1.5 flex gap-1.5">
                      <Button size="sm" variant="ghost" onClick={async () => { await ignore({ data: { restaurantId, id: m.id } }); refresh(); }}>Ignore</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
