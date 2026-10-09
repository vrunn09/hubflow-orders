import { supabase } from "@/integrations/supabase/client";

export const AUTO_PRINT_KEY = "rf.autoprint";
export const isAutoPrint = () => typeof window !== "undefined" && localStorage.getItem(AUTO_PRINT_KEY) === "1";
export const setAutoPrint = (on: boolean) => localStorage.setItem(AUTO_PRINT_KEY, on ? "1" : "0");

/** Kitchen printer preference — KOT tickets are printed on accept (no money shown). */
export const KOT_AUTO_PRINT_KEY = "rf.kot.autoprint";
export const isKotAutoPrint = () => typeof window !== "undefined" && localStorage.getItem(KOT_AUTO_PRINT_KEY) === "1";
export const setKotAutoPrint = (on: boolean) => localStorage.setItem(KOT_AUTO_PRINT_KEY, on ? "1" : "0");

/** Sends markup to a hidden frame and opens the printer directly, no browser dialog. */
function printHtml(html: string, keepFor = 60_000) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const d = f.contentWindow!.document;
  d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow!.focus(); f.contentWindow!.print(); setTimeout(() => f.remove(), keepFor); }, 300);
}

/**
 * Kitchen Order Ticket: what to cook and where it goes. Deliberately carries no
 * prices, totals or payment info — the kitchen screen never shows money.
 */
export async function printKOT(orderId: string, reprint = false) {
  const { data: o, error } = await supabase.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle();
  if (error || !o) throw new Error(error?.message ?? "Order not found");
  const { data: r } = await supabase.from("restaurants").select("name, phone, address").eq("id", o.restaurant_id).maybeSingle();
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const dt = (s?: string | null) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "");
  const qty = o.order_items.reduce((a: number, i: { quantity: number }) => a + i.quantity, 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>KOT ${esc(o.order_number)}</title><style>
  body{font-family:ui-monospace,monospace;width:72mm;margin:0 auto;padding:3mm;font-size:12px;color:#000}
  h1{font-size:15px;text-align:center;margin:0}.c{text-align:center}.s{font-size:10px}hr{border:0;border-top:1px dashed #000;margin:5px 0}
  table{width:100%;border-collapse:collapse}td{padding:1px 0;vertical-align:top}.r{text-align:right}
  .kot{border:2px solid #000;text-align:center;font-weight:bold;padding:4px;margin:4px 0;font-size:16px;letter-spacing:1px}
  .src{border:1px solid #000;text-align:center;font-weight:bold;padding:3px;margin:4px 0;font-size:12px}
  .itm{font-size:15px;font-weight:bold;border-top:1px solid #000;padding:3px 0}
  .qty{font-size:18px;font-weight:bold}
  @page{size:80mm auto;margin:0}</style></head><body>
  <h1>${esc(r?.name ?? "Restaurant")}</h1>
  <div class="c s">${esc(r?.address)}${r?.phone ? "<br>Ph: " + esc(r.phone) : ""}</div>
  <div class="kot">${reprint ? "REPRINT — " : ""}KITCHEN ORDER TICKET</div>
  <div class="src">${esc(platformName(o.source_platform ?? o.source_key))}${o.external_order_id ? " · #" + esc(o.external_order_id) : ""}</div>
  <table>
    <tr><td><b>Order</b></td><td class="r"><b>${esc(o.order_number)}</b></td></tr>
    <tr><td>Received</td><td class="r">${esc(dt(o.created_at))}</td></tr>
    ${o.deliver_by ? `<tr><td><b>Deliver by</b></td><td class="r"><b>${esc(dt(o.deliver_by))}</b></td></tr>` : ""}
    <tr><td>Ticket</td><td class="r">${esc(o.priority === "normal" ? "Normal" : o.priority)}</td></tr>
  </table>
  ${o.train_number || o.delivery_station ? `<hr><table>
    ${o.train_number ? `<tr><td>Train</td><td class="r"><b>${esc(o.train_number)} ${esc(o.train_name ?? "")}</b></td></tr>` : ""}
    ${o.journey_date ? `<tr><td>Journey date</td><td class="r">${esc(o.journey_date)}</td></tr>` : ""}
    ${o.delivery_station ? `<tr><td>Station</td><td class="r"><b>${esc(o.delivery_station)}</b></td></tr>` : ""}
    ${o.coach ? `<tr><td>Coach</td><td class="r"><b>${esc(o.coach)}</b></td></tr>` : ""}
    ${o.seat ? `<tr><td>Seat / Berth</td><td class="r"><b>${esc(o.seat)}</b></td></tr>` : ""}
  </table>` : ""}
  <hr>
  ${o.order_items.map((i: { name: string; quantity: number; notes: string | null }) => `<div class="itm"><span class="qty">${i.quantity}×</span> ${esc(i.name)}${i.notes ? `<div class="s">Note: ${esc(i.notes)}</div>` : ""}</div>`).join("")}
  <hr>
  <div class="c">Items: ${o.order_items.length} · Total qty: ${qty}</div>
  ${o.instructions ? `<div class="s"><b>Instruction:</b> ${esc(o.instructions)}</div>` : ""}
  <div class="c s">${reprint ? "Reprinted" : "Printed"} ${esc(dt(new Date().toISOString()))}</div>
  </body></html>`;
  printHtml(html);
}

const PLATFORM: Record<string, string> = { zoop: "Zoop", irctc_ecatering_: "IRCTC eCatering", railrestro: "RailRestro", railrecipe: "RailRecipe", yatrirestro: "YatriRestro", railyatri: "RailYatri", irctc: "IRCTC eCatering", irctc_ecatering: "IRCTC eCatering", poojapeda: "Pooja Peda", zomato: "Zomato", swiggy: "Swiggy", manual: "Manual / Counter", gmail_api: "Gmail" };
export const platformName = (k?: string | null) => (k ? PLATFORM[k.toLowerCase()] ?? k.replace(/[_-]/g, " ").toUpperCase() : "Unknown / Other");

/** Loads everything the bill needs (order, items, restaurant, source email) and prints it through a hidden frame. */
export async function printOrderBill(orderId: string) {
  const { data: o, error } = await supabase.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle();
  if (error || !o) throw new Error(error?.message ?? "Order not found");
  const [{ data: r }, { data: mail }] = await Promise.all([
    supabase.from("restaurants").select("name, address, phone, email, gstin").eq("id", o.restaurant_id).maybeSingle(),
    supabase.from("imported_emails").select("sender, subject, received_at").eq("order_id", o.id).eq("processing_status", "imported").maybeSingle(),
  ]);
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const rs = (n: number) => "₹" + Number(n || 0).toFixed(2);
  const kv = (l: string, v: unknown) => (v ? `<tr><td>${esc(l)}</td><td class="r">${esc(v)}</td></tr>` : "");
  const dt = (s?: string | null) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "");
  const qty = o.order_items.reduce((a, i) => a + i.quantity, 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${esc(o.order_number)}</title><style>
  body{font-family:ui-monospace,monospace;width:72mm;margin:0 auto;padding:3mm;font-size:11.5px;color:#000}
  h1{font-size:16px;text-align:center;margin:0}.c{text-align:center}.s{font-size:10px}hr{border:0;border-top:1px dashed #000;margin:5px 0}
  table{width:100%;border-collapse:collapse}td,th{padding:1px 0;vertical-align:top;text-align:left}.r{text-align:right}
  th{border-bottom:1px solid #000;font-size:10.5px}.b td{font-weight:bold;font-size:14px;border-top:1px solid #000;padding-top:3px}
  .src{border:1px solid #000;text-align:center;font-weight:bold;padding:3px;margin:4px 0;font-size:13px}
  @page{size:80mm auto;margin:0}</style></head><body>
  <h1>${esc(r?.name ?? "Restaurant")}</h1>
  <div class="c s">${esc(r?.address)}${r?.phone ? "<br>Ph: " + esc(r.phone) : ""}${r?.gstin ? "<br>GSTIN: " + esc(r.gstin) : ""}</div>
  <div class="c" style="margin-top:4px;font-weight:bold">TAX INVOICE / BILL</div>
  <div class="src">SOURCE: ${esc(platformName(o.source_platform ?? o.source_key))}</div>
  <table>${kv("Bill / Order #", o.order_number)}${kv("Platform order ID", o.external_order_id)}${kv("Date", dt(o.created_at))}${kv("Status", o.status)}</table><hr>
  <b>CUSTOMER</b><table>${kv("Name", o.customer_name)}${kv("Phone", o.customer_phone)}</table>
  ${o.train_number || o.delivery_station ? `<hr><b>TRAIN / DELIVERY</b><table>${kv("Train", o.train_number && `${o.train_number} ${o.train_name ?? ""}`)}${kv("Journey date", o.journey_date)}${kv("Station", o.delivery_station)}${kv("Coach", o.coach)}${kv("Seat / Berth", o.seat)}${kv("Deliver by", dt(o.deliver_by))}</table>` : ""}
  ${o.instructions ? `<div class="s">Note: ${esc(o.instructions)}</div>` : ""}<hr>
  <table><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amt</th></tr>
  ${o.order_items.map((i) => `<tr><td>${esc(i.name)}${i.notes ? `<div class="s">${esc(i.notes)}</div>` : ""}</td><td class="r">${i.quantity}</td><td class="r">${Number(i.unit_price).toFixed(2)}</td><td class="r">${(i.quantity * Number(i.unit_price)).toFixed(2)}</td></tr>`).join("")}</table>
  <div class="s">Items: ${o.order_items.length} · Qty: ${qty}</div><hr>
  <table>${kv("Subtotal", rs(o.subtotal))}${Number(o.tax) ? kv("GST / Tax", rs(o.tax)) : ""}${Number(o.delivery_fee) ? kv("Delivery fee", rs(o.delivery_fee)) : ""}${Number(o.discount) ? kv("Discount", "-" + rs(o.discount)) : ""}
  <tr class="b"><td>GRAND TOTAL</td><td class="r">${rs(o.total)}</td></tr></table>
  <table style="margin-top:3px">${kv("Payment mode", o.payment_method)}${kv("Payment status", o.payment_status)}</table>
  ${mail ? `<hr><div class="s">Received via email from ${esc(mail.sender)}<br>${esc(mail.subject)}<br>${esc(dt(mail.received_at))}</div>` : ""}
  <hr><div class="c">Thank you! Happy journey</div><div class="c s">Printed ${esc(dt(new Date().toISOString()))} · RailFeasto Order Hub</div>
  </body></html>`;
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const d = f.contentWindow!.document;
  d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow!.focus(); f.contentWindow!.print(); setTimeout(() => f.remove(), 60_000); }, 300);
}
