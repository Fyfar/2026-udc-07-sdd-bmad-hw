// Existing, already-specified pricing behaviour. All amounts are whole kopecks
// (1 грн = 100 копійок). The discount engine you build in this homework plugs
// in ALONGSIDE this — do not change these functions' signatures or behaviour.

import type { Order, LineItem } from "./types.js";

export function lineTotalKopecks(item: LineItem): number {
  return item.unitPriceKopecks * item.quantity;
}

export function subtotalKopecks(order: Order): number {
  return order.items.reduce((sum, i) => sum + lineTotalKopecks(i), 0);
}

/**
 * Shipping is a flat domestic/international fee, waived for orders that are
 * entirely digital. 49 грн domestic, 199 грн international. Deliberately simple
 * and fully specified — the ambiguity in this homework lives in discounts.
 */
export function shippingKopecks(order: Order): number {
  const allDigital = order.items.every((i) => i.category === "digital");
  if (allDigital) return 0;
  return order.country === "UA" ? 4_900 : 19_900;
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
