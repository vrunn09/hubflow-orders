import type { ReactNode } from "react";
import { useTenant, type Role } from "@/lib/tenant";
import { EmptyState, PermissionDenied } from "./states";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

/** UI-level role gate. Server functions and RLS enforce the real boundary. */
export function RoleGuard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can, restaurantId } = useTenant();
  if (!restaurantId) return <EmptyState title="No restaurant selected" body="Create a restaurant to get started." action={<Button asChild><Link to="/onboarding">Set up restaurant</Link></Button>} />;
  if (!can(...roles)) return <PermissionDenied />;
  return <>{children}</>;
}
