import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { formatINR } from "@/lib/order-status";
import { deleteMenuItem, saveMenuItem, setMenuItemAvailable } from "@/lib/api.functions";
import { RoleGuard } from "@/components/app/Guard";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/menu")({
  head: () => ({ meta: [{ title: "Menu — RailFeasto Order Hub" }, { name: "description", content: "Your dishes, prices and availability." }, { property: "og:title", content: "Menu" }, { property: "og:description", content: "Your dishes, prices and availability." }] }),
  component: () => <RoleGuard roles={["owner", "manager", "kitchen"]}><Menu /></RoleGuard>,
});

type Item = { id: string; name: string; category: string | null; price: number; available: boolean; notes: string | null };
const empty = { id: "", name: "", category: "", price: "", available: true, notes: "" };

function Menu() {
  const { restaurantId, can } = useTenant();
  const qc = useQueryClient();
  const save = useServerFn(saveMenuItem);
  const toggle = useServerFn(setMenuItemAvailable);
  const remove = useServerFn(deleteMenuItem);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const writable = can("owner", "manager");

  const q = useQuery({
    queryKey: ["menu-items", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("id, name, category, price, available, notes").eq("restaurant_id", restaurantId).order("category", { ascending: true }).order("name");
      if (error) throw error;
      return data as Item[];
    },
  });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const items = (q.data ?? []).filter((i) => !term || i.name.toLowerCase().includes(term.toLowerCase()));
  const groups = items.reduce<Record<string, Item[]>>((m, i) => { const k = i.category?.trim() || "Uncategorised"; (m[k] ??= []).push(i); return m; }, {});

  async function submit() {
    const price = Number(form.price);
    if (form.name.trim().length < 2) return toast.error("Item name chhota hai");
    if (!Number.isFinite(price) || price < 0) return toast.error("Price sahi daaliye");
    setBusy(true);
    try {
      await save({ data: { restaurantId, ...(form.id ? { itemId: form.id } : {}), name: form.name.trim(), category: form.category.trim() || undefined, price, available: form.available, notes: form.notes.trim() || undefined } });
      toast.success(form.id ? "Item updated" : "Item added");
      setOpen(false); setForm(empty); qc.invalidateQueries({ queryKey: ["menu-items"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    setBusy(false);
  }

  return (
    <div>
      <PageHeader title="Menu" description="Dishes and prices used across the hub. Kitchen staff see this list read-only."
        actions={writable && <Button variant="saffron" onClick={() => { setForm(empty); setOpen(true); }}><Plus />Add item</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search dish" className="pl-8" />
        </div>
        <span className="tabular ml-auto text-xs text-muted-foreground">{items.length} items · {(q.data ?? []).filter((i) => i.available).length} available</span>
      </div>
      {q.isLoading ? <TableSkeleton /> : !items.length ? <EmptyState title="Menu is empty" body="Add your dishes so orders can be checked against real prices." /> : (
        <div className="space-y-6">{Object.entries(groups).map(([cat, list]) => (
          <section key={cat}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{cat}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((i) => (
                <article key={i.id} className={cn("surface flex items-start gap-3 p-3", !i.available && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{i.name}</div>
                    <div className="tabular text-sm text-saffron">{formatINR(i.price)}</div>
                    {i.notes && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{i.notes}</div>}
                  </div>
                  {writable && (
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Switch checked={i.available} aria-label={`${i.name} available`} onCheckedChange={async (v) => { try { await toggle({ data: { itemId: i.id, available: v } }); qc.invalidateQueries({ queryKey: ["menu-items"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }} />
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${i.name}`} onClick={() => { setForm({ id: i.id, name: i.name, category: i.category ?? "", price: String(i.price), available: i.available, notes: i.notes ?? "" }); setOpen(true); }}><Pencil className="size-4" /></Button>
                        {can("owner") && <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label={`Delete ${i.name}`} onClick={async () => { if (!confirm(`Delete ${i.name}?`)) return; try { await remove({ data: { itemId: i.id } }); qc.invalidateQueries({ queryKey: ["menu-items"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}><Trash2 className="size-4" /></Button>}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}</div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Edit item" : "Add item"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="m-name">Dish name</Label><Input id="m-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Paneer Thali" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="m-cat">Category</Label><Input id="m-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Veg Main" /></div>
              <div><Label htmlFor="m-price">Price (₹)</Label><Input id="m-price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="180" /></div>
            </div>
            <div><Label htmlFor="m-notes">Note for kitchen</Label><Textarea id="m-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Served with mint chutney" /></div>
            <label className="flex items-center gap-2 text-sm"><Switch id="m-avail" checked={form.available} onCheckedChange={(v) => setForm({ ...form, available: v })} />Available to sell</label>
            <Button className="w-full" variant="saffron" disabled={busy} onClick={submit}>{busy ? "Saving…" : form.id ? "Save changes" : "Add to menu"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
