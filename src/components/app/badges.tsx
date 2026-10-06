import { cn } from "@/lib/utils";
import { STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { CONNECTORS } from "@/lib/connectors/registry";

const tone: Record<string, string> = {
  NEW: "bg-saffron-soft text-saffron-foreground border-saffron/30",
  ACCEPTED: "bg-info-soft text-info border-info/20",
  PREPARING: "bg-warning-soft text-warning border-warning/20",
  READY: "bg-success-soft text-success border-success/20",
  ASSIGNED: "bg-info-soft text-info border-info/20",
  OUT_FOR_DELIVERY: "bg-info-soft text-info border-info/20",
  DELIVERED: "bg-success-soft text-success border-success/20",
  CANCELLED: "bg-muted text-muted-foreground border-border",
  REFUNDED: "bg-muted text-muted-foreground border-border",
  FAILED: "bg-destructive-soft text-destructive border-destructive/20",
  PAID: "bg-success-soft text-success border-success/20",
  PENDING: "bg-warning-soft text-warning border-warning/20",
  connected: "bg-success-soft text-success border-success/20",
  syncing: "bg-info-soft text-info border-info/20",
  paused: "bg-warning-soft text-warning border-warning/20",
  error: "bg-destructive-soft text-destructive border-destructive/20",
  not_connected: "bg-muted text-muted-foreground border-border",
};

export function Pill({ value, label, className }: { value: string; label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold", tone[value] ?? "bg-muted text-muted-foreground border-border", className)}>
      {label ?? STATUS_LABEL[value as OrderStatus] ?? value.replace(/_/g, " ")}
    </span>
  );
}

export function SourceTag({ k }: { k: string }) {
  const name = CONNECTORS.find((c) => c.key === k)?.name.split(" (")[0]?.split(" /")[0] ?? k;
  return <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">{name}</span>;
}

export function EnvTag({ env }: { env: string }) {
  return env === "mock"
    ? <span className="rounded border border-dashed border-warning/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">Test mode</span>
    : <span className="rounded border border-success/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">Live</span>;
}
