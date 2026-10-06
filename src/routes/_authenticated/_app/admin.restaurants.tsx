import { createFileRoute } from "@tanstack/react-router";
import { SimpleTable } from "@/components/app/SimpleTable";
import { useAdminData, type AdminData } from "./admin";

export const Route = createFileRoute("/_authenticated/_app/admin/restaurants")({ component: () => {
  const d = useAdminData().data as AdminData;
  return <SimpleTable rows={d.restaurants} cols={[
    ["Name", (r) => <span className="font-semibold">{r.name}</span>], ["Email", (r) => r.email], ["Phone", (r) => r.phone],
    ["Staff", (r) => d.members.filter((m) => m.restaurant_id === r.id).length],
    ["Orders", (r) => d.orders.filter((o) => o.restaurant_id === r.id).length],
    ["Status", (r) => (r.active ? "Active" : "Suspended")], ["Created", (r) => new Date(r.created_at).toLocaleDateString("en-IN")],
  ]} />;
} });
