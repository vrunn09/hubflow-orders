import { z } from "zod";

/** The single unified order shape every connector must produce. */
export const unifiedOrderSchema = z.object({
  external_order_id: z.string().min(1).max(120),
  customer_name: z.string().min(1).max(120),
  customer_phone: z.string().max(20).optional().nullable(),
  train_number: z.string().max(10).optional().nullable(),
  train_name: z.string().max(120).optional().nullable(),
  journey_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  delivery_station: z.string().max(80).optional().nullable(),
  coach: z.string().max(10).optional().nullable(),
  seat: z.string().max(10).optional().nullable(),
  instructions: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        quantity: z.number().int().positive().max(999),
        unit_price: z.number().nonnegative().max(100000),
        notes: z.string().max(200).optional().nullable(),
      }),
    )
    .min(1)
    .max(100),
  tax: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  delivery_fee: z.number().nonnegative().default(0),
  payment_method: z.enum(["COD", "UPI", "CARD", "PREPAID", "WALLET"]).default("COD"),
  deliver_by: z.string().datetime().optional().nullable(),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
});
export type UnifiedOrder = z.infer<typeof unifiedOrderSchema>;

export type ConnectionMethod = "oauth" | "webhook" | "api_key" | "email_parse" | "manual" | "mock";

export interface ConnectorDefinition {
  key: string;
  name: string;
  description: string;
  /** Production methods this connector supports. Empty = no authorized production path yet. */
  methods: ConnectionMethod[];
  /** Whether a production integration is actually implemented in this codebase. */
  productionReady: boolean;
  productionNote: string;
  /** Converts a raw source payload into the unified order format. */
  normalize(raw: unknown): UnifiedOrder;
  /** Produces a realistic sample raw payload for mock/test mode. */
  mockPayload(stations: string[]): unknown;
}
