import { createFileRoute } from "@tanstack/react-router";
import { StatCard } from "@/components/app/states";
import { formatINR } from "@/lib/order-status";
import { useAdminData, type AdminData } from "./admin";

export const Route = createFileRoute("/_authenticated/_app/admin/")({ component: Overview });

function Overview() {
  const d = useAdminData().data as AdminData;
  const gmv = d.orders.filter((o) => !["CANCELLED", "FAILED", "REFUNDED"].includes(o.status)).reduce((s, o) => s + Number(o.total), 0);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Restaurants" value={d.restaurants.length} accent />
      <StatCard label="Team members" value={d.members.length} />
      <StatCard label="Recent orders" value={d.orders.length} hint={`${formatINR(gmv)} GMV`} />
      <StatCard label="Unhealthy sources" value={d.sources.filter((s) => s.status === "error" || s.health === "down" || s.health === "degraded").length} />
      <StatCard label="Jobs done" value={d.jobs["done"] ?? 0} />
      <StatCard label="Jobs failed (retrying)" value={d.jobs["failed"] ?? 0} />
      <StatCard label="Duplicates blocked" value={d.jobs["duplicate"] ?? 0} />
      <StatCard label="Jobs pending" value={(d.jobs["pending"] ?? 0) + (d.jobs["processing"] ?? 0)} />
    </div>
  );
}
