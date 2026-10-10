import { ZodError } from "zod";

/** Stable error codes for order ingestion. `retryable` = a later attempt may succeed with the same payload. */
export const INGEST_ERRORS = {
  VALIDATION_NO_ITEMS: { retryable: false, label: "No food items could be read from this message" },
  VALIDATION_MISSING_ORDER_ID: { retryable: false, label: "Order ID is missing" },
  VALIDATION_FAILED: { retryable: false, label: "Order details are incomplete or invalid" },
  NOT_AN_ORDER: { retryable: false, label: "Message is not a food order" },
  STATUS_UPDATE_EMAIL: { retryable: false, label: "Delivery/cancellation update for an existing order" },
  INVALID_PAYLOAD: { retryable: false, label: "Payload is empty or unreadable" },
  UNKNOWN_CONNECTOR: { retryable: false, label: "Unknown order source" },
  AI_UNAVAILABLE: { retryable: true, label: "AI order reader temporarily unavailable" },
  DB_ERROR: { retryable: true, label: "Database write failed" },
  UNKNOWN: { retryable: true, label: "Unexpected error" },
} as const;
export type IngestErrorCode = keyof typeof INGEST_ERRORS;

export class IngestError extends Error {
  constructor(public code: IngestErrorCode, message: string) { super(message); }
}

const STATUS_UPDATE_RE = /delivered|delivery time passed|cancel|undeliver|refund/i;
const NEW_ORDER_RE = /new (irctc )?order|order (placed|received|confirmed)/i;
export function isStatusUpdateSubject(subject: string | undefined | null) {
  return !!subject && STATUS_UPDATE_RE.test(subject) && !NEW_ORDER_RE.test(subject);
}

/** Maps any thrown error to a stable code + a safe (no secrets / no customer PII) reason. */
export function classifyIngestError(e: unknown): { code: IngestErrorCode; reason: string } {
  if (e instanceof IngestError) return { code: e.code, reason: e.message };
  if (e instanceof ZodError) {
    const paths = e.issues.map((i) => i.path.join(".") || "payload");
    if (paths.some((p) => p.startsWith("items"))) return { code: "VALIDATION_NO_ITEMS", reason: INGEST_ERRORS.VALIDATION_NO_ITEMS.label };
    if (paths.includes("external_order_id")) return { code: "VALIDATION_MISSING_ORDER_ID", reason: INGEST_ERRORS.VALIDATION_MISSING_ORDER_ID.label };
    return { code: "VALIDATION_FAILED", reason: `Invalid fields: ${[...new Set(paths)].join(", ")}`.slice(0, 300) };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/not a food order/i.test(msg)) return { code: "NOT_AN_ORDER", reason: INGEST_ERRORS.NOT_AN_ORDER.label };
  if (/^Unknown connector/i.test(msg)) return { code: "UNKNOWN_CONNECTOR", reason: msg.slice(0, 200) };
  if (/AI (processing|returned)/i.test(msg)) return { code: "AI_UNAVAILABLE", reason: msg.replace(/\s+/g, " ").slice(0, 200) };
  if (/duplicate key|violates|relation|permission denied|fetch failed|timeout/i.test(msg)) return { code: "DB_ERROR", reason: msg.slice(0, 200) };
  return { code: "UNKNOWN", reason: msg.slice(0, 200) };
}

/** Exponential backoff: 1, 2, 4, 8 … minutes, capped at 6h. */
export function backoffMs(attempts: number) {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 6 * 3600_000);
}

export function dedupeKeyFor(raw: unknown): string | null {
  if (raw && typeof raw === "object" && "messageId" in raw && (raw as { messageId: unknown }).messageId)
    return `msg:${String((raw as { messageId: unknown }).messageId).slice(0, 200)}`;
  return null;
}
