import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "owner" | "manager" | "kitchen" | "delivery" | "admin";
export interface Membership {
  id: string;
  role: Role;
  restaurant: { id: string; name: string; logo_url: string | null; stations: string[] };
}

interface TenantCtx {
  user: User;
  memberships: Membership[];
  current: Membership | null;
  restaurantId: string;
  role: Role;
  isPlatformAdmin: boolean;
  setCurrent: (id: string) => void;
  can: (...roles: Role[]) => boolean;
}
const Ctx = createContext<TenantCtx | null>(null);
const KEY = "rf.restaurant";

export function useMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: ["memberships", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data, error }, { data: roles }] = await Promise.all([
        supabase.from("restaurant_members").select("id, role, restaurant:restaurants(id, name, logo_url, stations)")
          .eq("user_id", userId!).eq("active", true),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
      ]);
      if (error) throw error;
      return {
        memberships: (data ?? []).filter((m) => m.restaurant) as unknown as Membership[],
        isPlatformAdmin: (roles ?? []).some((r) => r.role === "admin"),
      };
    },
  });
}

export function TenantProvider({ user, memberships, isPlatformAdmin, children }: { user: User; memberships: Membership[]; isPlatformAdmin: boolean; children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const qc = useQueryClient();
  useEffect(() => setSelected(localStorage.getItem(KEY)), []);
  const current = memberships.find((m) => m.restaurant.id === selected) ?? memberships[0] ?? null;
  const value = useMemo<TenantCtx>(() => ({
    user, memberships, current, isPlatformAdmin,
    restaurantId: current?.restaurant.id ?? "",
    role: current?.role ?? "kitchen",
    setCurrent: (id) => { localStorage.setItem(KEY, id); setSelected(id); qc.invalidateQueries(); },
    can: (...roles) => isPlatformAdmin || (!!current && roles.includes(current.role)),
  }), [user, memberships, current, isPlatformAdmin, qc]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTenant outside TenantProvider");
  return v;
}
