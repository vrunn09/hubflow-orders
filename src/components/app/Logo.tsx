import { cn } from "@/lib/utils";

export function Logo({ inverted, compact }: { inverted?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-md bg-saffron text-sm font-extrabold text-saffron-foreground">RF</span>
      {!compact && (
        <span className={cn("leading-none", inverted ? "text-sidebar-accent-foreground" : "text-foreground")}>
          <span className="block text-sm font-bold">RailFeasto</span>
          <span className={cn("block text-[11px] font-medium", inverted ? "text-sidebar-foreground" : "text-muted-foreground")}>Order Hub</span>
        </span>
      )}
    </span>
  );
}
