import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3, Bell, Bike, ChefHat, ClipboardList, FileText, HelpCircle, LayoutDashboard, LogOut, Menu, Plug,
  Receipt, Settings, Shield, Truck, User, Users, Wallet, Inbox, AlertTriangle, Activity, CheckCircle2, PackageCheck, XCircle, Ban, UtensilsCrossed, Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { claimInvites, retryFailedJobs } from "@/lib/api.functions";
import { syncGmailNow } from "@/lib/gmail.functions";
import { TenantProvider, useMemberships, useTenant, type Role } from "@/lib/tenant";
import { useTenantRealtime } from "@/lib/realtime";
import { Logo } from "@/components/app/Logo";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/app/states";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app")({ component: AppLayout, pendingComponent: AppLoading, pendingMs: 0 });

function AppLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <Logo />
      <div className="text-sm text-muted-foreground">Dashboard khul raha hai…</div>
    </div>
  );
}

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; roles: Role[]; status?: string; badge?: "new" | "review" };
const ALL: Role[] = ["owner", "manager", "kitchen", "delivery"];
const MGR: Role[] = ["owner", "manager"];
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Operations", items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: MGR },
    { to: "/orders", label: "Live Order Inbox", icon: Inbox, roles: MGR, status: "NEW", badge: "new" },
    { to: "/needs-review", label: "Needs Review", icon: AlertTriangle, roles: MGR, badge: "review" },
    { to: "/kitchen", label: "Kitchen / KOT", icon: ChefHat, roles: ["owner", "manager", "kitchen"] },
    { to: "/menu", label: "Menu", icon: UtensilsCrossed, roles: ["owner", "manager", "kitchen"] },
  ] },
  { group: "Orders", items: [
    { to: "/orders", label: "All Orders", icon: ClipboardList, roles: MGR, status: "" },
    { to: "/orders", label: "Active Orders", icon: Activity, roles: MGR, status: "ACCEPTED,PREPARING,READY,ASSIGNED,OUT_FOR_DELIVERY" },
    { to: "/orders", label: "Confirmed Orders", icon: CheckCircle2, roles: MGR, status: "ACCEPTED" },
    { to: "/orders", label: "Delivered Orders", icon: PackageCheck, roles: MGR, status: "DELIVERED" },
    { to: "/orders", label: "Cancelled Orders", icon: XCircle, roles: MGR, status: "CANCELLED,REFUNDED" },
    { to: "/orders", label: "Undelivered / Failed", icon: Ban, roles: MGR, status: "FAILED" },
  ] },
  { group: "Delivery", items: [
    { to: "/delivery", label: "Delivery Board", icon: Truck, roles: ["owner", "manager", "delivery"] },
    { to: "/delivery-partners", label: "Delivery Executives", icon: Bike, roles: MGR },
  ] },
  { group: "Finance & Reports", items: [
    { to: "/payments", label: "Payments & COD", icon: Wallet, roles: MGR },
    { to: "/settlements", label: "Reconciliation", icon: Receipt, roles: MGR },
    { to: "/analytics", label: "Daily Business", icon: BarChart3, roles: MGR },
    { to: "/reports", label: "Reports", icon: FileText, roles: MGR },
    { to: "/item-reports", label: "Item Reports", icon: Package, roles: MGR },
  ] },
  { group: "Workspace", items: [
    { to: "/order-sources", label: "Platform Connections", icon: Plug, roles: MGR },
    { to: "/notifications", label: "Notifications", icon: Bell, roles: ALL },
    { to: "/staff", label: "Team & Permissions", icon: Users, roles: ["owner"] },
    { to: "/settings", label: "Settings", icon: Settings, roles: ["owner"] },
    { to: "/profile", label: "Profile", icon: User, roles: ALL },
    { to: "/help", label: "Help & Support", icon: HelpCircle, roles: ALL },
  ] },
];

function AppLayout() {
  const { user } = Route.useRouteContext();
  const nav = useNavigate();
  const claim = useServerFn(claimInvites);
  const [claimed, setClaimed] = useState(false);
  useEffect(() => { claim().catch(() => {}).finally(() => setClaimed(true)); }, [claim]);
  const q = useMemberships(claimed ? user.id : undefined);

  useEffect(() => {
    if (q.data && q.data.memberships.length === 0 && !q.data.isPlatformAdmin) nav({ to: "/onboarding" });
  }, [q.data, nav]);

  if (q.error) return <div className="p-6"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return (
    <div className="flex min-h-screen"><div className="hidden w-60 bg-sidebar lg:block" /><div className="flex-1 space-y-4 p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div></div>
  );
  return (
    <TenantProvider user={user} memberships={q.data.memberships} isPlatformAdmin={q.data.isPlatformAdmin}>
      <Shell />
    </TenantProvider>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { can, isPlatformAdmin, restaurantId } = useTenant();
  const loc = useRouterState({ select: (s) => s.location });
  const curStatus = String((loc.search as { status?: string }).status ?? "");
  const counts = useQuery({
    queryKey: ["nav-counts", restaurantId], enabled: !!restaurantId && can("owner", "manager"), refetchInterval: 30_000,
    queryFn: async () => {
      const [n, r] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "NEW"),
        supabase.from("imported_emails").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("processing_status", "needs_review"),
      ]);
      return { new: n.count ?? 0, review: r.count ?? 0 };
    },
  });
  const item = (it: NavItem) => {
    const onPath = loc.pathname === it.to || loc.pathname.startsWith(it.to + "/");
    const active = it.status !== undefined ? loc.pathname === it.to && curStatus === it.status : onPath;
    const badge = it.badge ? counts.data?.[it.badge] : 0;
    return (
      <Link key={it.label} to={it.to} search={(it.status !== undefined ? { status: it.status || undefined } : {}) as never} onClick={onNavigate}
        className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
          active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground")}>
        <it.icon className={cn("size-4", active && "text-saffron")} /><span className="flex-1 truncate">{it.label}</span>
        {!!badge && <span className="rounded-full bg-saffron px-1.5 text-[10px] font-bold text-saffron-foreground">{badge > 99 ? "99+" : badge}</span>}
      </Link>
    );
  };
  return (
    <nav className="space-y-4">
      {NAV.map((g) => {
        const items = g.items.filter((i) => can(...i.roles));
        if (!items.length) return null;
        return <div key={g.group}><div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/50">{g.group}</div><div className="space-y-0.5">{items.map(item)}</div></div>;
      })}
      {isPlatformAdmin && <div><div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/50">Platform</div>{item({ to: "/admin", label: "Admin panel", icon: Shield, roles: ALL })}</div>}
    </nav>
  );
}

function Shell() {
  const { current, memberships, setCurrent, restaurantId, role, user } = useTenant();
  const live = useTenantRealtime(restaurantId);
  const retry = useServerFn(retryFailedJobs);
  const { can } = useTenant();
  const canRetry = can("owner", "manager");
  // Background retry worker: while a manager has the hub open, failed imports are retried every 5 minutes.
  useEffect(() => {
    if (!restaurantId || !canRetry) return;
    const tick = () => retry({ data: { restaurantId } }).catch(() => {});
    tick();
    const t = setInterval(tick, 5 * 60_000);
    return () => clearInterval(t);
  }, [restaurantId, canRetry, retry]);
  // Gmail watcher: checks the connected Gmail every minute while a manager has the hub open.
  const gmailSync = useServerFn(syncGmailNow);
  useEffect(() => {
    if (!restaurantId || !canRetry) return;
    const tick = () => gmailSync({ data: { restaurantId } }).catch(() => {});
    const first = setTimeout(tick, 5_000);
    const t = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [restaurantId, canRetry, gmailSync]);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const unread = useQuery({
    queryKey: ["notifications", "unread", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => (await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("read", false)).count ?? 0,
  });
  const signOut = async () => { await supabase.auth.signOut(); nav({ to: "/login" }); };

  const sidebar = (
    <div className="flex h-full flex-col gap-5 bg-sidebar p-3">
      <div className="px-2 pt-1"><Logo inverted /></div>
      {memberships.length > 0 && (
        <select aria-label="Restaurant" value={restaurantId} onChange={(e) => setCurrent(e.target.value)}
          className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2 py-1.5 text-sm text-sidebar-accent-foreground">
          {memberships.map((m) => <option key={m.restaurant.id} value={m.restaurant.id}>{m.restaurant.name}</option>)}
        </select>
      )}
      <div className="flex-1 overflow-y-auto"><NavList onNavigate={() => setOpen(false)} /></div>
      <div className="border-t border-sidebar-border pt-3">
        <div className="truncate px-2 text-xs text-sidebar-foreground">{user.email}</div>
        <div className="px-2 text-[11px] font-semibold uppercase text-saffron">{role}</div>
        <button onClick={signOut} className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent"><LogOut className="size-4" />Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">{sidebar}</aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0"><SheetTitle className="sr-only">Navigation</SheetTitle>{sidebar}</SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></Button>
          <div className="lg:hidden"><Logo compact /></div>
          <div className="min-w-0 truncate text-sm font-semibold">{current?.restaurant.name ?? "Platform admin"}</div>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Real-time connection">
              <span className={cn("size-2 rounded-full", live === "live" ? "live-dot bg-success" : live === "offline" ? "bg-destructive" : "bg-warning")} />
              <span className="hidden sm:inline">{live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting"}</span>
            </span>
            <Link to="/notifications" className="relative rounded-md p-2 hover:bg-accent" aria-label="Notifications">
              <Bell className="size-4" />
              {!!unread.data && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-saffron px-1 text-center text-[10px] font-bold text-saffron-foreground">{unread.data > 99 ? "99+" : unread.data}</span>}
            </Link>
          </div>
        </header>
        {live === "offline" && <div className="bg-destructive-soft px-4 py-1.5 text-center text-xs font-medium text-destructive">Connection lost — live updates paused. Reconnecting…</div>}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6"><Outlet /></main>
      </div>
    </div>
  );
}
