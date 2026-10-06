import { createFileRoute } from "@tanstack/react-router";
import { SimpleTable } from "@/components/app/SimpleTable";
import { useAdminData, type AdminData } from "./admin";

export const Route = createFileRoute("/_authenticated/_app/admin/audit-logs")({ component: () => {
  const d = useAdminData().data as AdminData;
  const rest = (id: string | null) => (id ? d.restaurants.find((r) => r.id === id)?.name ?? "—" : "Platform");
  return <SimpleTable rows={d.audits} cols={[
    ["When", (a) => new Date(a.created_at).toLocaleString("en-IN")], ["Restaurant", (a) => rest(a.restaurant_id)],
    ["Action", (a) => <span className="font-mono text-xs">{a.action}</span>], ["Entity", (a) => `${a.entity ?? ""} ${a.entity_id?.slice(0, 8) ?? ""}`],
    ["Actor", (a) => <span className="font-mono text-xs">{a.actor_id?.slice(0, 8)}</span>], ["Details", (a) => <span className="text-xs text-muted-foreground">{JSON.stringify(a.meta)}</span>],
  ]} />;
} });
