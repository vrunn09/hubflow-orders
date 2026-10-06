import { createFileRoute } from "@tanstack/react-router";
import { SimpleTable } from "@/components/app/SimpleTable";
import { EnvTag, Pill } from "@/components/app/badges";
import { useAdminData, type AdminData } from "./admin";

export const Route = createFileRoute("/_authenticated/_app/admin/integrations")({ component: () => {
  const d = useAdminData().data as AdminData;
  const rest = (id: string) => d.restaurants.find((r) => r.id === id)?.name ?? "—";
  return <SimpleTable rows={d.sources} cols={[
    ["Source", (s) => s.display_name], ["Restaurant", (s) => rest(s.restaurant_id)], ["Mode", (s) => <EnvTag env={s.environment} />],
    ["Status", (s) => <Pill value={s.status} />], ["Health", (s) => s.health], ["Orders", (s) => s.orders_received],
    ["Last sync", (s) => (s.last_sync_at ? new Date(s.last_sync_at).toLocaleString("en-IN") : "Never")],
    ["Last error", (s) => <span className="text-xs text-destructive">{s.last_error}</span>],
  ]} />;
} });
