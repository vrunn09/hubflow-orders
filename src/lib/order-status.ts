export const ORDER_FLOW = ["NEW", "ACCEPTED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
export const TERMINAL = ["DELIVERED", "CANCELLED", "REFUNDED", "FAILED"] as const;
export type OrderStatus = (typeof ORDER_FLOW)[number] | "CANCELLED" | "REFUNDED" | "FAILED";

export const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["OUT_FOR_DELIVERY", "READY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: ["REFUNDED"],
  FAILED: ["REFUNDED"],
  REFUNDED: [],
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "New", ACCEPTED: "Accepted", PREPARING: "Preparing", READY: "Ready", ASSIGNED: "Assigned",
  OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled", REFUNDED: "Refunded", FAILED: "Failed",
};

/** Which roles may move an order into a given status. */
export const STATUS_ROLES: Record<OrderStatus, string[]> = {
  NEW: [], ACCEPTED: ["owner", "manager", "kitchen"], PREPARING: ["owner", "manager", "kitchen"], READY: ["owner", "manager", "kitchen"],
  ASSIGNED: ["owner", "manager"], OUT_FOR_DELIVERY: ["owner", "manager", "delivery"], DELIVERED: ["owner", "manager", "delivery"],
  CANCELLED: ["owner", "manager"], REFUNDED: ["owner"], FAILED: ["owner", "manager", "delivery"],
};

export const formatINR = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n ?? 0));
