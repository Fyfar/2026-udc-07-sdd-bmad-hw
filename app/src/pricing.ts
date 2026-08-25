// Existing, already-specified pricing behaviour. All amounts are integer cents.
// The discount engine you build in this homework plugs in ALONGSIDE this —
// do not change these functions' signatures or behaviour.

import type { Order, LineItem } from "./types.js";

export function lineTotalCents(item: LineItem): number {
  return item.unitPriceCents * item.quantity;
}

export function subtotalCents(order: Order): number {
  return order.items.reduce((sum, i) => sum + lineTotalCents(i), 0);
}

/**
 * Shipping is a flat domestic/international fee, waived for orders that are
 * entirely digital. Deliberately simple and fully specified — the ambiguity in
 * this homework lives in discounts, not here.
 */
export function shippingCents(order: Order): number {
  const allDigital = order.items.every((i) => i.category === "digital");
  if (allDigital) return 0;
  return order.country === "UA" ? 4900 : 19900;
}

/** Tier gives a headline percentage. What it applies TO is part of the spec you write. */
export function tierPercent(order: Order): number {
  switch (order.customerTier) {
    case "gold":
      return 10;
    case "silver":
      return 5;
    default:
      return 0;
  }
}
