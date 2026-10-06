import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminOverview } from "@/lib/api.functions";
import { ErrorState, PageHeader, PermissionDenied, TableSkeleton } from "@/components/app/states";

export const Route = createFileRoute("/_authenticated/_app/admin")({
  head: () => ({ meta: [{ title: "Admin — RailFeasto Order Hub" }, { name: "description", content: "Platform administration." }, { property: "og:title", content: "Admin" }, { property: "og:description", content: "Platform administration." }] }),
  component: AdminLayout,
});

export function useAdminData() {
  const fn = useServerFn(adminOverview);
  return useQuery({ queryKey: ["admin"], queryFn: () => fn(), refetchInterval: 30_000 });
}
export type AdminData = Extract<Awaited<ReturnType<typeof adminOverview>>, { allowed: true }>;

const TABS = [["/admin", "Overview"], ["/admin/restaurants", "Restaurants"], ["/admin/users", "Users"], ["/admin/orders", "Orders"], ["/admin/integrations", "Integrations"], ["/admin/audit-logs", "Audit logs"]] as const;

function AdminLayout() {
  const q = useAdminData();
  if (q.isLoading) return <TableSkeleton />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data?.allowed) return <PermissionDenied />;
  return (
    <div>
      <PageHeader title="Platform admin" description="Cross-tenant view. Every action here is server-authorized." />
      <div className="-mx-4 mb-5 overflow-x-auto px-4"><div className="flex w-max gap-1 border-b">
        {TABS.map(([to, l]) => <Link key={to} to={to} activeOptions={{ exact: true }} className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground" activeProps={{ className: "border-saffron! font-semibold text-foreground!" }}>{l}</Link>)}
      </div></div>
      <Outlet />
    </div>
  );
}
