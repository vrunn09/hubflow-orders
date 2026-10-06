import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type Source = Database["public"]["Tables"]["order_sources"]["Row"];

export function useOrdersSince(restaurantId: string, days: number, key = "range") {
  return useQuery({
    queryKey: ["orders", key, restaurantId, days],
    enabled: !!restaurantId,
    queryFn: async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (days - 1));
      const { data, error } = await supabase.from("orders").select("*").eq("restaurant_id", restaurantId)
        .gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return data;
    },
  });
}

export function useActiveOrdersWithItems(restaurantId: string, statuses: string[]) {
  return useQuery({
    queryKey: ["orders", "active", restaurantId, statuses.join(",")],
    enabled: !!restaurantId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, order_number, source_key, status, delivery_status, priority, deliver_by, created_at, train_number, train_name, delivery_station, coach, seat, instructions, customer_name, customer_phone, order_items(name, quantity, notes), deliveries(partner_id, status, delivery_partners(name))")
        .eq("restaurant_id", restaurantId).in("status", statuses as never).order("created_at", { ascending: true }).limit(300);
      if (error) throw error;
      return data;
    },
  });
}

export function useSources(restaurantId: string) {
  return useQuery({
    queryKey: ["sources", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_sources").select("*").eq("restaurant_id", restaurantId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function usePartners(restaurantId: string) {
  return useQuery({
    queryKey: ["partners", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_partners").select("*").eq("restaurant_id", restaurantId).order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function groupSum<T>(rows: T[], key: (r: T) => string, val: (r: T) => number = () => 1) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return [...m.entries()].map(([name, value]) => ({ name, value }));
}

export function dailySeries(rows: Order[], days: number) {
  const out: { day: string; orders: number; sales: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const dayRows = rows.filter((r) => r.created_at.slice(0, 10) === k);
    out.push({
      day: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      orders: dayRows.length,
      sales: dayRows.filter((r) => !["CANCELLED", "FAILED", "REFUNDED"].includes(r.status)).reduce((s, r) => s + Number(r.total), 0),
    });
  }
  return out;
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0] ?? {});
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}
