import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isAutoPrint, printOrderBill } from "@/lib/print-bill";

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
          const o = p.new as { id: string; order_number: string; customer_name: string };
          toast.success(`New order ${o.order_number}`, { description: o.customer_name });
          playOrderChime();
          if (isAutoPrint()) printOrderBill(o.id).catch(() => toast.error("Auto-print failed — open the order and press Print bill"));
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

/** Short two-tone bell for new orders (no audio file needed). Browsers allow it after the user has clicked once. */
function playOrderChime() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    [880, 1320, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      const t = ctx.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.24);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* sound not available */ }
}
