import { unifiedOrderSchema, type ConnectorDefinition, type UnifiedOrder } from "./types";
import { mockRailOrder } from "./mock-data";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Rail-style payload (RailFeasto / IRCTC e-Catering share this partner shape). */
function normalizeRail(raw: any): UnifiedOrder {
  return unifiedOrderSchema.parse({
    external_order_id: String(raw.id),
    customer_name: raw.passenger?.name,
    customer_phone: raw.passenger?.mobile,
    train_number: raw.train?.number,
    train_name: raw.train?.name,
    journey_date: raw.journeyDate,
    delivery_station: raw.station,
    coach: raw.coach,
    seat: raw.berth,
    instructions: raw.note ?? null,
    items: (raw.items ?? []).map((i: any) => ({ name: i.name, quantity: Number(i.qty), unit_price: Number(i.price) })),
    tax: 0,
    discount: 0,
    delivery_fee: 0,
    payment_method: raw.payment,
    deliver_by: raw.eta,
    priority: "normal",
  });
}

/** Aggregator-style payload (Zomato / Swiggy style partner webhooks). */
function normalizeAggregator(raw: any): UnifiedOrder {
  return unifiedOrderSchema.parse({
    external_order_id: String(raw.order_id),
    customer_name: raw.customer?.name,
    customer_phone: raw.customer?.phone,
    delivery_station: raw.delivery?.location ?? null,
    instructions: raw.delivery?.instructions ?? null,
    items: (raw.cart ?? []).map((i: any) => ({ name: i.title, quantity: Number(i.quantity), unit_price: Number(i.unit_cost) })),
    tax: Number(raw.charges?.taxes ?? 0),
    discount: Number(raw.charges?.discount ?? 0),
    delivery_fee: Number(raw.charges?.packaging ?? 0),
    payment_method: raw.is_prepaid ? "PREPAID" : "COD",
    deliver_by: raw.promised_at ?? null,
  });
}

function mockAggregator(stations: string[]) {
  const r = mockRailOrder(stations);
  return {
    order_id: `AG${r.id}`.toUpperCase(),
    customer: { name: r.passenger.name, phone: r.passenger.mobile },
    delivery: { location: r.station, instructions: "Call on arrival" },
    cart: r.items.map((i) => ({ title: i.name, quantity: i.qty, unit_cost: i.price })),
    charges: { taxes: 18, discount: Math.random() > 0.6 ? 40 : 0, packaging: 15 },
    is_prepaid: Math.random() > 0.3,
    promised_at: r.eta,
  };
}

/** Email-parsed payload (structured fields extracted from an order confirmation email). */
function normalizeEmail(raw: any): UnifiedOrder {
  const body: string = raw.body ?? "";
  const field = (label: string) => body.match(new RegExp(`${label}:\\s*(.+)`, "i"))?.[1]?.trim() ?? null;
  const items = [...body.matchAll(/^-\s*(\d+)\s*x\s*(.+?)\s*@\s*(\d+(?:\.\d+)?)/gim)].map((m) => ({
    name: m[2], quantity: Number(m[1]), unit_price: Number(m[3]),
  }));
  return unifiedOrderSchema.parse({
    external_order_id: field("Order ID") ?? raw.messageId,
    customer_name: field("Customer") ?? "Email customer",
    customer_phone: field("Phone"),
    train_number: field("Train"),
    delivery_station: field("Station"),
    coach: field("Coach"),
    seat: field("Seat"),
    items,
    payment_method: (field("Payment") ?? "COD").toUpperCase(),
  });
}

function mockEmail(stations: string[]) {
  const r = mockRailOrder(stations);
  return {
    messageId: `msg-${r.id}`,
    subject: `New order ${r.id}`,
    body: [
      `Order ID: EM-${r.id}`, `Customer: ${r.passenger.name}`, `Phone: ${r.passenger.mobile}`,
      `Train: ${r.train.number}`, `Station: ${r.station}`, `Coach: ${r.coach}`, `Seat: ${r.berth}`,
      `Payment: ${r.payment === "PREPAID" ? "UPI" : r.payment}`, "Items:",
      ...r.items.map((i) => `- ${i.qty} x ${i.name} @ ${i.price}`),
    ].join("\n"),
  };
}

/** Passthrough: payload is already in unified format (manual entry, generic signed webhooks). */
const normalizeUnified = (raw: unknown) => unifiedOrderSchema.parse(raw);
const mockUnified = (stations: string[]) => normalizeRail(mockRailOrder(stations));

export const CONNECTORS: ConnectorDefinition[] = [
  {
    key: "railfeasto", name: "RailFeasto", description: "In-train food orders from the RailFeasto network.",
    methods: ["webhook"], productionReady: true,
    productionNote: "Production orders arrive on a signed webhook endpoint. Share the endpoint and secret with RailFeasto.",
    normalize: normalizeRail, mockPayload: mockRailOrder, aiFallback: true,
  },
  {
    key: "gmail", name: "Gmail / Google Email", description: "Parse order confirmation emails from your Google inbox.",
    methods: ["oauth", "email_parse"], productionReady: false,
    productionNote: "Uses Google OAuth + Gmail API (read-only). Requires a Google OAuth client to be configured for this workspace before real inboxes can be connected.",
    normalize: normalizeEmail, mockPayload: mockEmail, aiFallback: true, keywords: ["google", "email", "inbox"],
  },
  {
    key: "gmail_forward", name: "Gmail Inbox (auto-forward)", description: "Order emails from IRCTC, Zoop, RailRestro, Pooja Peda etc. land in your Gmail and appear here within a minute.",
    methods: ["webhook", "email_parse"], productionReady: true, aiFallback: true,
    keywords: ["gmail", "google", "email", "inbox", "irctc", "zoop", "railrestro", "yatrirestro", "railrecipe", "pooja peda"],
    productionNote: "A small script runs inside your own Gmail and sends new order emails to your private link. No password is shared.",
    normalize: normalizeEmail, mockPayload: mockEmail,
  },
  {
    key: "zomato", name: "Zomato", description: "Orders from Zomato for Business.",
    methods: ["webhook", "api_key"], productionReady: false,
    productionNote: "Requires official partner API access granted by Zomato. Until then, use test mode.",
    normalize: normalizeAggregator, mockPayload: mockAggregator, aiFallback: true,
  },
  {
    key: "swiggy", name: "Swiggy", description: "Orders from Swiggy Partner.",
    methods: ["webhook", "api_key"], productionReady: false,
    productionNote: "Requires official partner API access granted by Swiggy. Until then, use test mode.",
    normalize: normalizeAggregator, mockPayload: mockAggregator, aiFallback: true,
  },
  {
    key: "irctc", name: "IRCTC e-Catering", keywords: ["ecatering", "e-catering", "railway"], description: "Authorized e-Catering vendor orders.",
    methods: ["webhook", "api_key"], productionReady: false,
    productionNote: "Requires authorized e-Catering vendor credentials issued by IRCTC.",
    normalize: normalizeRail, mockPayload: mockRailOrder, aiFallback: true,
  },
  {
    key: "webhook", name: "Other Platform (Webhook)", description: "Any future platform that can POST orders in the unified format.",
    methods: ["webhook"], productionReady: true,
    productionNote: "Signed webhook endpoint accepting the unified order JSON format.",
    normalize: normalizeUnified, mockPayload: mockUnified, aiFallback: true,
  },
  {
    key: "ai_universal", name: "Any Platform (AI order reader)", description: "Send orders in any format — JSON or plain text — and AI converts them into your order format.",
    methods: ["webhook"], productionReady: true, aiFallback: true, keywords: ["other", "custom", "zoop", "railrestro", "pooja peda", "travelkhana", "ai", "gemini"],
    productionNote: "Signed webhook endpoint. Any platform, forwarding tool or automation can POST its order data as-is; AI reads it.",
    normalize: () => { throw new Error("route to AI reader"); }, mockPayload: mockEmail,
  },
  {
    key: "zoop", name: "Zoop", description: "In-train food orders from Zoop.", methods: [], productionReady: false, keywords: ["zoopindia"],
    productionNote: "Zoop does not offer an automated merchant order feed. Sync is unavailable until an official integration exists — use Any Platform (AI reader) if you can forward orders.",
    normalize: normalizeRail, mockPayload: mockRailOrder, aiFallback: true,
  },
  {
    key: "railrestro", name: "RailRestro", description: "In-train food orders from RailRestro.", methods: [], productionReady: false,
    productionNote: "RailRestro does not offer an automated merchant order feed. Sync is unavailable until an official integration exists.",
    normalize: normalizeRail, mockPayload: mockRailOrder, aiFallback: true,
  },
  {
    key: "manual", name: "Direct / Manual Orders", description: "Phone, walk-in and counter orders entered by staff.",
    methods: ["manual"], productionReady: true, productionNote: "Always available.",
    normalize: normalizeUnified, mockPayload: mockUnified,
  },
];

export function getConnector(key: string): ConnectorDefinition {
  const c = CONNECTORS.find((x) => x.key === key);
  if (!c) throw new Error(`Unknown connector: ${key}`);
  return c;
}
