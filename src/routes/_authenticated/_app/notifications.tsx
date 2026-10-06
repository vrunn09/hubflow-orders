import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/notifications")({
  head: () => ({ meta: [{ title: "Notifications — RailFeasto Order Hub" }, { name: "description", content: "Order, payment, kitchen, delivery and integration alerts." }, { property: "og:title", content: "Notifications" }, { property: "og:description", content: "All alerts in one place." }] }),
  component: Notifications,
});

const CATS = [["", "All"], ["order", "New orders"], ["payment", "Payments"], ["kitchen", "Kitchen"], ["delivery", "Delivery"], ["integration", "Integration errors"], ["system", "System"]] as const;

function Notifications() {
  const { restaurantId } = useTenant();
  const qc = useQueryClient();
  const [cat, setCat] = useState("");
  const q = useQuery({
    queryKey: ["notifications", "list", restaurantId, cat],
    queryFn: async () => {
      let s = supabase.from("notifications").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(200);
      if (cat) s = s.eq("category", cat);
      const { data, error } = await s; if (error) throw error; return data;
    },
  });
  const markAll = async () => { await supabase.from("notifications").update({ read: true }).eq("restaurant_id", restaurantId).eq("read", false); qc.invalidateQueries({ queryKey: ["notifications"] }); };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" actions={<Button variant="outline" size="sm" onClick={markAll}>Mark all read</Button>} />
      <div className="mb-3 flex flex-wrap gap-1">{CATS.map(([v, l]) => <button key={v} onClick={() => setCat(v)} className={cn("rounded-md px-2.5 py-1 text-xs", cat === v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{l}</button>)}</div>
      {q.isLoading ? <TableSkeleton /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <EmptyState title="No notifications" body="You're all caught up." /> : (
        <ul className="surface divide-y">
          {q.data.map((n) => (
            <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.read && "bg-saffron-soft/40")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.category === "integration" ? "bg-destructive" : n.read ? "bg-transparent" : "bg-saffron")} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{n.link ? <a href={n.link} className="hover:underline">{n.title}</a> : n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
              </div>
              <div className="text-right text-[11px] text-muted-foreground"><div className="uppercase">{n.category}</div>{new Date(n.created_at).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
