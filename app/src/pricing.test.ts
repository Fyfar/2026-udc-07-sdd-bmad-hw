import { describe, it, expect } from "vitest";
import {
  lineTotalKopecks,
  subtotalKopecks,
  shippingKopecks,
  tierPercent,
} from "./pricing.js";
import type { Order, LineItem } from "./types.js";

// Amounts are whole kopecks. 25_000 = 250 грн.
const item = (over: Partial<LineItem> = {}): LineItem => ({
  sku: "AA-1",
  name: "Thing",
  unitPriceKopecks: 25_000,
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

describe("lineTotalKopecks", () => {
  it("multiplies unit price by quantity", () => {
    // 62.50 грн × 4 = 250 грн
    expect(lineTotalKopecks(item({ unitPriceKopecks: 6_250, quantity: 4 }))).toBe(25_000);
  });
});

describe("subtotalKopecks", () => {
  it("sums every line", () => {
    // 500 грн + 2 × 250 грн = 1000 грн
    const o = order({
      items: [item({ unitPriceKopecks: 50_000 }), item({ unitPriceKopecks: 25_000, quantity: 2 })],
    });
    expect(subtotalKopecks(o)).toBe(100_000);
  });

  it("is 0 for an empty order", () => {
    expect(subtotalKopecks(order({ items: [] }))).toBe(0);
  });
});

describe("shippingKopecks", () => {
  it("charges the domestic fee for UA (49 грн)", () => {
    expect(shippingKopecks(order({ country: "UA" }))).toBe(4_900);
  });

  it("charges the international fee otherwise (199 грн)", () => {
    expect(shippingKopecks(order({ country: "PL" }))).toBe(19_900);
  });

  it("waives shipping when every line is digital", () => {
    expect(shippingKopecks(order({ items: [item({ category: "digital" })] }))).toBe(0);
  });

  it("still charges when the order mixes digital and physical", () => {
    const o = order({ items: [item({ category: "digital" }), item({ category: "fresh" })] });
    expect(shippingKopecks(o)).toBe(4_900);
  });
});

describe("tierPercent", () => {
  it("maps tiers to their headline percentage", () => {
    expect(tierPercent(order({ customerTier: "none" }))).toBe(0);
    expect(tierPercent(order({ customerTier: "silver" }))).toBe(5);
    expect(tierPercent(order({ customerTier: "gold" }))).toBe(10);
  });
});
