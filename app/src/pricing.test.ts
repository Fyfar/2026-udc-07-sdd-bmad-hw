import { describe, it, expect } from "vitest";
import { lineTotalCents, subtotalCents, shippingCents, tierPercent } from "./pricing.js";
import type { Order, LineItem } from "./types.js";

const item = (over: Partial<LineItem> = {}): LineItem => ({
  sku: "AA-1",
  name: "Thing",
  unitPriceCents: 1000,
  quantity: 1,
  category: "standard",
  ...over,
});

const order = (over: Partial<Order> = {}): Order => ({
  id: "o1",
  items: [item()],
  country: "UA",
  customerTier: "none",
  coupons: [],
  ...over,
});

describe("lineTotalCents", () => {
  it("multiplies unit price by quantity", () => {
    expect(lineTotalCents(item({ unitPriceCents: 250, quantity: 4 }))).toBe(1000);
  });
});

describe("subtotalCents", () => {
  it("sums every line", () => {
    const o = order({ items: [item({ unitPriceCents: 500 }), item({ unitPriceCents: 250, quantity: 2 })] });
    expect(subtotalCents(o)).toBe(1000);
  });

  it("is 0 for an empty order", () => {
    expect(subtotalCents(order({ items: [] }))).toBe(0);
  });
});

describe("shippingCents", () => {
  it("charges the domestic fee for UA", () => {
    expect(shippingCents(order({ country: "UA" }))).toBe(4900);
  });

  it("charges the international fee otherwise", () => {
    expect(shippingCents(order({ country: "PL" }))).toBe(19900);
  });

  it("waives shipping when every line is digital", () => {
    expect(shippingCents(order({ items: [item({ category: "digital" })] }))).toBe(0);
  });

  it("still charges when the order mixes digital and physical", () => {
    const o = order({ items: [item({ category: "digital" }), item({ category: "fresh" })] });
    expect(shippingCents(o)).toBe(4900);
  });
});

describe("tierPercent", () => {
  it("maps tiers to their headline percentage", () => {
    expect(tierPercent(order({ customerTier: "none" }))).toBe(0);
    expect(tierPercent(order({ customerTier: "silver" }))).toBe(5);
    expect(tierPercent(order({ customerTier: "gold" }))).toBe(10);
  });
});
