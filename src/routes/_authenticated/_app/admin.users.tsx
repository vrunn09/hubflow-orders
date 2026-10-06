import { createFileRoute } from "@tanstack/react-router";
import { SimpleTable } from "@/components/app/SimpleTable";
import { useAdminData, type AdminData } from "./admin";

export const Route = createFileRoute("/_authenticated/_app/admin/users")({ component: () => {
  const d = useAdminData().data as AdminData;
  const rest = (id: string) => d.restaurants.find((r) => r.id === id)?.name ?? "—";
  return <SimpleTable rows={d.members} cols={[
    ["Name", (m) => m.display_name ?? "—"], ["Email", (m) => m.invited_email ?? "—"], ["Restaurant", (m) => rest(m.restaurant_id)],
    ["Role", (m) => <span className="text-xs font-semibold uppercase">{m.role}</span>], ["Account", (m) => (m.user_id ? "Linked" : "Invite pending")], ["Active", (m) => (m.active ? "Yes" : "No")],
  ]} />;
} });
