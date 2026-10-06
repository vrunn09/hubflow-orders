import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** One realtime subscription per tenant: keeps every order/notification/source query fresh without refresh. */
export function useTenantRealtime(restaurantId: string) {
  const qc = useQueryClient();
  const [state, setState] = useState<"connecting" | "live" | "offline">("connecting");
  useEffect(() => {
    if (!restaurantId) return;
    const filter = `restaurant_id=eq.${restaurantId}`;
    const channel = supabase
      .channel(`tenant-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter }, (p) => {
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["order"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        if (p.eventType === "INSERT") {
          const o = p.new as { order_number: string; customer_name: string };
          toast.success(`New order ${o.order_number}`, { description: o.customer_name });
          playOrderChime();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter }, () =>
        qc.invalidateQueries({ queryKey: ["notifications"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "order_sources", filter }, () =>
        qc.invalidateQueries({ queryKey: ["sources"] }))
      .subscribe((s) => setState(s === "SUBSCRIBED" ? "live" : s === "CLOSED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT" ? "offline" : "connecting"));
    const off = () => setState("offline");
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("offline", off); supabase.removeChannel(channel); };
  }, [restaurantId, qc]);
  return state;
}
