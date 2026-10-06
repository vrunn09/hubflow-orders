import { createFileRoute } from "@tanstack/react-router";
import { SimpleTable } from "@/components/app/SimpleTable";
import { Pill, SourceTag } from "@/components/app/badges";
import { formatINR } from "@/lib/order-status";
import { useAdminData, type AdminData } from "./admin";

export const Route = createFileRoute("/_authenticated/_app/admin/orders")({ component: () => {
  const d = useAdminData().data as AdminData;
  const rest = (id: string) => d.restaurants.find((r) => r.id === id)?.name ?? "—";
  return <SimpleTable rows={d.orders} cols={[
    ["Order", (o) => <span className="font-mono text-xs">{o.order_number}</span>], ["Restaurant", (o) => rest(o.restaurant_id)], ["Source", (o) => <SourceTag k={o.source_key} />],
    ["Customer", (o) => o.customer_name], ["Total", (o) => <span className="tabular">{formatINR(o.total)}</span>], ["Status", (o) => <Pill value={o.status} />],
    ["Placed", (o) => new Date(o.created_at).toLocaleString("en-IN")],
  ]} />;
} });
