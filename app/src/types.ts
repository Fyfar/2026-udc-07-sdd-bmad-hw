// Order domain types. Stable contract — the feature you build in this homework
// extends behaviour, it does not change these shapes.

export interface LineItem {
  sku: string;
  name: string;
  /** Unit price in minor units (cents). Integer arithmetic on purpose. */
  unitPriceCents: number;
  quantity: number;
  /** Product category — some pricing rules care about it. */
  category: "standard" | "fresh" | "digital";
}

export interface Order {
  id: string;
  items: LineItem[];
  /** Destination country code, ISO-3166 alpha-2. */
  country: string;
  /** Customer tier, earned from lifetime spend. */
  customerTier: "none" | "silver" | "gold";
  /** Coupon codes the customer typed at checkout, in the order they typed them. */
  coupons: string[];
}

export interface Coupon {
  code: string;
  kind: "percent" | "fixed";
  /** For percent: 0-100. For fixed: amount in cents. */
  value: number;
  /** ISO date; the coupon is not valid on or after this instant. */
  expiresAt: string;
  /** If set, the coupon only applies to items of this category. */
  category?: LineItem["category"];
  /** If set, the order subtotal must reach this before the coupon applies. */
  minSubtotalCents?: number;
}
