import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Lock, WifiOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="surface space-y-3 p-4" aria-busy>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
    </div>
  );
}

export function CardsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
    </div>
  );
}

function StateBox({ icon, title, body, action, tone = "muted" }: { icon: ReactNode; title: string; body?: string; action?: ReactNode; tone?: "muted" | "error" }) {
  return (
    <div className="surface flex flex-col items-center px-6 py-12 text-center">
      <div className={cn("mb-3 flex size-10 items-center justify-center rounded-full", tone === "error" ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground")}>{icon}</div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const EmptyState = (p: { title: string; body?: string; action?: ReactNode }) => <StateBox icon={<Inbox className="size-5" />} {...p} />;
export const ErrorState = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <StateBox tone="error" icon={<AlertTriangle className="size-5" />} title="Something went wrong"
    body={error instanceof Error ? error.message : "Please try again."}
    action={retry && <Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
);
export const PermissionDenied = () => (
  <StateBox icon={<Lock className="size-5" />} title="You don't have access to this page" body="Ask the restaurant owner to update your role if you need it." />
);
export const OfflineState = () => (
  <StateBox tone="error" icon={<WifiOff className="size-5" />} title="You're offline" body="Live updates resume automatically when the connection is back." />
);

export function StatCard({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className={cn("surface p-4", accent && "border-saffron/40")}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tabular mt-1.5 text-2xl font-bold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
