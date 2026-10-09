import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { ignoreImportedEmail } from "@/lib/gmail.functions";
import { RoleGuard } from "@/components/app/Guard";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_app/needs-review")({
  head: () => ({ meta: [{ title: "Needs Review — RailFeasto Order Hub" }, { name: "description", content: "Possible order emails that need a manual check." }, { property: "og:title", content: "Needs Review" }, { property: "og:description", content: "Possible order emails that need a manual check." }] }),
  component: () => <RoleGuard roles={["owner", "manager"]}><NeedsReview /></RoleGuard>,
});

const PLAT = (p: string) => (p === "UNKNOWN" ? "Unknown / Other" : p.replace(/_/g, " "));

function NeedsReview() {
  const { restaurantId } = useTenant();
  const qc = useQueryClient();
  const ignore = useServerFn(ignoreImportedEmail);
  const q = useQuery({
    queryKey: ["needs-review", restaurantId], enabled: !!restaurantId, refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("imported_emails").select("id, gmail_message_id, sender, subject, received_at, platform, snippet, confidence, error_message")
        .eq("restaurant_id", restaurantId).eq("processing_status", "needs_review").order("received_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const done = () => { qc.invalidateQueries({ queryKey: ["needs-review"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); };

  return (
    <div>
      <PageHeader title="Needs Review" description="We detected a possible food order, but some information could not be reliably extracted. Nothing here is counted as an order until you create it." />
      {q.isLoading ? <TableSkeleton /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState title="Sab clear hai" body="Koi email review ke liye baaki nahi hai." />
      ) : (
        <ul className="space-y-2">
          {q.data.map((m) => (
            <li key={m.id} className="surface p-3 text-sm">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{m.subject || "(no subject)"}</div>
                  <div className="text-xs text-muted-foreground">Source: <b className="text-saffron">{PLAT(m.platform)}</b> · {m.sender} · {m.received_at ? new Date(m.received_at).toLocaleString("en-IN") : "—"} · confidence {Math.round(Number(m.confidence) * 100)}%</div>
                  {m.snippet && <p className="mt-1 line-clamp-2 text-muted-foreground">{m.snippet}</p>}
                  {m.error_message && <p className="mt-1 text-xs text-destructive">Missing: {/items/.test(m.error_message) ? "food items" : "some order details"}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" asChild><a href={`https://mail.google.com/mail/u/0/#all/${m.gmail_message_id}`} target="_blank" rel="noreferrer"><ExternalLink />Review email</a></Button>
                  <Button size="sm" variant="saffron" asChild><Link to="/orders" search={{ new: true }}><Plus />Create order</Link></Button>
                  <Button size="sm" variant="ghost" onClick={async () => { try { await ignore({ data: { restaurantId, id: m.id } }); toast.success("Ignored"); done(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>Ignore</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
