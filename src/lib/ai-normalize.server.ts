import { unifiedOrderSchema, type UnifiedOrder } from "./connectors/types";

/**
 * AI processing layer: reads an order in ANY format (JSON from any platform, or email/text)
 * and converts it into the unified Order Hub format. Only fields present in the source are filled.
 */
const nullable = (t: string) => ({ type: [t, "null"] });
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_order", "external_order_id", "customer_name", "customer_phone", "train_number", "train_name", "journey_date",
    "delivery_station", "coach", "seat", "instructions", "items", "tax", "discount", "delivery_fee", "payment_method"],
  properties: {
    is_order: { type: "boolean" },
    external_order_id: nullable("string"),
    customer_name: nullable("string"),
    customer_phone: nullable("string"),
    train_number: nullable("string"),
    train_name: nullable("string"),
    journey_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    delivery_station: nullable("string"),
    coach: nullable("string"),
    seat: nullable("string"),
    instructions: nullable("string"),
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["name", "quantity", "unit_price"],
        properties: { name: { type: "string" }, quantity: { type: "integer" }, unit_price: { type: "number" } },
      },
    },
    tax: nullable("number"),
    discount: nullable("number"),
    delivery_fee: nullable("number"),
    payment_method: { type: ["string", "null"], enum: ["COD", "UPI", "CARD", "PREPAID", "WALLET", null] },
  },
};

export async function aiNormalizeOrder(raw: unknown, platformName: string): Promise<UnifiedOrder> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI processing is not configured");
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions:
        "You extract food orders for an Indian restaurant order hub. Read the payload and fill ONLY fields actually present; use null otherwise. Never invent values. Prices in rupees. If the payload is not a food order, set is_order=false.",
      input: `Platform: ${platformName}\nPayload:\n${text.slice(0, 20000)}`,
      text: { format: { type: "json_schema", name: "order", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`AI processing failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);

  // Consume SSE stream and collect output text.
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") out += ev.delta;
        if (ev.type === "error" || ev.type === "response.failed") throw new Error(ev.error?.message ?? "AI processing failed");
      } catch (e) { if (e instanceof Error && e.message.includes("AI")) throw e; }
    }
  }
  if (!out) throw new Error("AI returned no result");
  const p = JSON.parse(out);
  if (!p.is_order) throw new Error("AI: payload is not a food order");
  return unifiedOrderSchema.parse({
    external_order_id: p.external_order_id ?? undefined,
    customer_name: p.customer_name ?? "Customer",
    customer_phone: p.customer_phone?.slice(0, 20), train_number: p.train_number?.slice(0, 10), train_name: p.train_name,
    journey_date: /^\d{4}-\d{2}-\d{2}$/.test(p.journey_date ?? "") ? p.journey_date : null,
    delivery_station: p.delivery_station?.slice(0, 80), coach: p.coach?.slice(0, 10), seat: p.seat?.slice(0, 10),
    instructions: p.instructions?.slice(0, 500),
    items: p.items, tax: p.tax ?? 0, discount: p.discount ?? 0, delivery_fee: p.delivery_fee ?? 0,
    payment_method: p.payment_method ?? "COD",
  });
}
