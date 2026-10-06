import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createManualOrder } from "@/lib/api.functions";
import { useTenant } from "@/lib/tenant";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ManualOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { restaurantId, current } = useTenant();
  const create = useServerFn(createManualOrder);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ customer_name: "", customer_phone: "", train_number: "", delivery_station: "", coach: "", seat: "", payment_method: "COD", instructions: "" });
  const [items, setItems] = useState([{ name: "", quantity: 1, unit_price: 0 }]);
  const s = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const total = items.reduce((a, i) => a + i.quantity * i.unit_price, 0);

  async function submit() {
    setBusy(true);
    try {
      await create({ data: { restaurantId, order: {
        external_order_id: `MAN-${Date.now()}`, ...f, payment_method: f.payment_method as "COD",
        journey_date: f.train_number ? new Date().toISOString().slice(0, 10) : null,
        items: items.filter((i) => i.name.trim()), tax: 0, discount: 0, delivery_fee: 0, priority: "normal",
      } } });
      toast.success("Order created");
      onOpenChange(false);
      setItems([{ name: "", quantity: 1, unit_price: 0 }]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create order"); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>New manual order</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Customer *</Label><Input value={f.customer_name} onChange={s("customer_name")} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input value={f.customer_phone} onChange={s("customer_phone")} /></div>
          <div className="space-y-1"><Label>Train no.</Label><Input value={f.train_number} onChange={s("train_number")} /></div>
          <div className="space-y-1"><Label>Station</Label>
            <Input list="stations" value={f.delivery_station} onChange={s("delivery_station")} />
            <datalist id="stations">{current?.restaurant.stations.map((x) => <option key={x} value={x} />)}</datalist></div>
          <div className="space-y-1"><Label>Coach</Label><Input value={f.coach} onChange={s("coach")} /></div>
          <div className="space-y-1"><Label>Seat</Label><Input value={f.seat} onChange={s("seat")} /></div>
          <div className="space-y-1"><Label>Payment</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.payment_method} onChange={s("payment_method")}>
              {["COD", "UPI", "CARD", "PREPAID"].map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="space-y-1"><Label>Instructions</Label><Input value={f.instructions} onChange={s("instructions")} /></div>
        </div>
        <div className="space-y-2">
          <Label>Items</Label>
          {items.map((it, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="Item" value={it.name} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <Input className="w-16" type="number" min={1} value={it.quantity} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Math.max(1, +e.target.value) } : x))} />
              <Input className="w-24" type="number" min={0} placeholder="₹" value={it.unit_price} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unit_price: Math.max(0, +e.target.value) } : x))} />
              <Button variant="ghost" size="icon" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { name: "", quantity: 1, unit_price: 0 }])}><Plus />Add item</Button>
        </div>
        <DialogFooter className="items-center gap-3">
          <span className="tabular mr-auto text-sm font-semibold">Total ₹{total}</span>
          <Button variant="saffron" disabled={busy || !f.customer_name || !items.some((i) => i.name)} onClick={submit}>{busy ? "Creating…" : "Create order"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
