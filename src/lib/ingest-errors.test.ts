import { describe, expect, it } from "vitest";
import { unifiedOrderSchema } from "./connectors/types";
import { getConnector } from "./connectors/registry";
import { backoffMs, classifyIngestError, dedupeKeyFor, IngestError, isStatusUpdateSubject } from "./ingest-errors";

const zodErr = (o: unknown) => { try { unifiedOrderSchema.parse(o); } catch (e) { return e; } throw new Error("expected failure"); };

describe("ingest error classification", () => {
  it("empty items → permanent VALIDATION_NO_ITEMS (root cause of the alert flood)", () => {
    const r = classifyIngestError(zodErr({ external_order_id: "1", customer_name: "A", items: [] }));
    expect(r.code).toBe("VALIDATION_NO_ITEMS");
  });
  it("missing order id", () => {
    expect(classifyIngestError(zodErr({ customer_name: "A", items: [{ name: "x", quantity: 1, unit_price: 1 }] })).code).toBe("VALIDATION_MISSING_ORDER_ID");
  });
  it("AI outage is retryable, not-an-order is not", () => {
    expect(classifyIngestError(new Error("AI processing failed [503]: busy")).code).toBe("AI_UNAVAILABLE");
    expect(classifyIngestError(new Error("AI: payload is not a food order")).code).toBe("NOT_AN_ORDER");
    expect(classifyIngestError(new IngestError("DB_ERROR", "x")).code).toBe("DB_ERROR");
  });
  it("status-update subjects are never new orders", () => {
    expect(isStatusUpdateSubject("IRCTC eCatering Order #2493863620 Delivery Time Passed")).toBe(true);
    expect(isStatusUpdateSubject("IRCTC eCatering Order #2493057495 Delivered")).toBe(true);
    expect(isStatusUpdateSubject("New IRCTC Order #2493057495")).toBe(false);
  });
  it("backoff grows exponentially and is capped", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(backoffMs(30)).toBe(6 * 3600_000);
  });
  it("stable dedupe key from Gmail message id", () => {
    expect(dedupeKeyFor({ messageId: "abc" })).toBe("msg:abc");
    expect(dedupeKeyFor({ id: 1 })).toBeNull();
  });
});

describe("email connector parsing", () => {
  const c = getConnector("gmail_api");
  it("parses a structured order email", () => {
    const o = c.normalize({ messageId: "m1", body: "Order ID: Z123\nCustomer: Ravi\nTrain: 12345\nStation: JBP\nCoach: B2\nSeat: 34\nPayment: cod\n- 2 x Veg Thali @ 150" });
    expect(o).toMatchObject({ external_order_id: "Z123", customer_name: "Ravi", coach: "B2", seat: "34", payment_method: "COD" });
    expect(o.items).toEqual([{ name: "Veg Thali", quantity: 2, unit_price: 150 }]);
  });
  it("rejects an email with no items instead of inventing data", () => {
    expect(() => c.normalize({ messageId: "m2", body: "Dear Ravi, your order #1 was delivered" })).toThrow();
  });
});
