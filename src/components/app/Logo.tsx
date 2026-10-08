import { cn } from "@/lib/utils";
import logoLight from "@/assets/logo-light.png";
import logoDark from "@/assets/logo-dark.png";

export function Logo({ inverted, compact, className }: { inverted?: boolean; compact?: boolean; className?: string }) {
  return (
    <img
      src={inverted ? logoDark : logoLight}
      alt="RailFeasto Order Hub"
      className={cn("w-auto", compact ? "h-8" : "h-11", className)}
      width={1265}
      height={878}
    />
  );
}
