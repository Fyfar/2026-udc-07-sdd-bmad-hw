import { describe, it, expect } from "vitest";
import { applyDiscounts } from "./discounts.js";
import { shippingKopecks, subtotalKopecks, tierPercent } from "./pricing.js";
import type { Order, LineItem, Coupon } from "./types.js";

// Amounts are whole kopecks.
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

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  code: "CODE",
  kind: "percent",
  value: 10,
  expiresAt: "2099-01-01T00:00:00.000Z",
  ...over,
});

const NOW = new Date("2026-06-01T00:00:00.000Z");

// Compile-time guard for Story 1.2 AC2: asOf has no default, so a call
// missing it must fail to typecheck. Never executed.
function _typeGuardAsOfIsRequired(o: Order, cs: Coupon[]): void {
  // @ts-expect-error asOf is required -- no default inside the pure engine.
  applyDiscounts(o, cs);
}

describe("Story 1.1: initialize per-category buckets and apply the tier discount", () => {
  it("applies a Gold order's 10% tier discount to a single-category items subtotal, leaving shipping unchanged (AC1)", () => {
    const o = order({ customerTier: "gold", items: [item({ unitPriceKopecks: 100_000 })] });
    const result = applyDiscounts(o, [], NOW);
    expect(result.itemsTotalKopecks).toBe(90_000);
    expect(result.shippingKopecks).toBe(shippingKopecks(o));
  });

  it("leaves the items total unchanged for customerTier none, running the same 0% code path (AC2)", () => {
    const o = order({ customerTier: "none", items: [item({ unitPriceKopecks: 100_000 })] });
    const result = applyDiscounts(o, [], NOW);
    expect(result.itemsTotalKopecks).toBe(subtotalKopecks(o));
  });

  it("seeds exactly one bucket per distinct category and reduces each independently by the tier percentage (AC3)", () => {
    const fresh100 = coupon({ code: "FRESH100", category: "fresh", value: 100 });
    const std100 = coupon({ code: "STD100", category: "standard", value: 100 });
    const o = order({
      customerTier: "gold",
      items: [
        item({ category: "fresh", unitPriceKopecks: 600 }),
        item({ category: "standard", unitPriceKopecks: 400 }),
      ],
      coupons: ["FRESH100", "STD100"],
    });
    const result = applyDiscounts(o, [fresh100, std100], NOW);
    // A 100% category coupon strips its bucket to 0, revealing the exact
    // post-tier bucket value as discountKopecks.
    expect(result.coupons[0]).toEqual({ code: "FRESH100", applied: true, discountKopecks: 540 });
    expect(result.coupons[1]).toEqual({ code: "STD100", applied: true, discountKopecks: 360 });
  });

  it("partitions a single-category order into one bucket, so a non-category fixed coupon's full amount lands on it (AC4)", () => {
    const c = coupon({ code: "SAVE100", kind: "fixed", value: 100 });
    const o = order({ items: [item({ category: "digital", unitPriceKopecks: 1_000 })], coupons: ["SAVE100"] });
    const result = applyDiscounts(o, [c], NOW);
    expect(result.itemsTotalKopecks).toBe(900);
  });
});

describe("Story 1.2: deterministic reference time for expiry checks", () => {
  const expiring = coupon({ code: "EXP", expiresAt: "2026-06-01T12:00:00.000Z" });

  it("produces different outcomes for asOf values straddling expiresAt (AC1)", () => {
    const o = order({ coupons: ["EXP"] });
    const before = applyDiscounts(o, [expiring], new Date("2026-06-01T11:59:59.999Z"));
    const after = applyDiscounts(o, [expiring], new Date("2026-06-01T12:00:00.000Z"));
    expect(before.coupons[0]?.applied).toBe(true);
    expect(after.coupons[0]).toEqual({ code: "EXP", applied: false, reason: "expired" });
  });

  it("produces byte-for-byte identical results for repeated calls with the same order/coupons/asOf (AC3)", () => {
    const o = order({ coupons: ["EXP"] });
    const r1 = applyDiscounts(o, [expiring], NOW);
    const r2 = applyDiscounts(o, [expiring], NOW);
    expect(r1).toEqual(r2);
  });

  it("does not mutate its order or coupons parameters (NFR2)", () => {
    const o = order({ coupons: ["EXP"] });
    const catalog = [expiring];
    const orderSnapshot = JSON.parse(JSON.stringify(o)) as unknown;
    const catalogSnapshot = JSON.parse(JSON.stringify(catalog)) as unknown;
    applyDiscounts(o, catalog, NOW);
    expect(o).toEqual(orderSnapshot);
    expect(catalog).toEqual(catalogSnapshot);
  });
});

describe("Story 2.1: resolve typed codes against the coupon catalog", () => {
  it("matches a catalog code trimmed and case-insensitively (AC1)", () => {
    const c = coupon({ code: "AUTUMN10" });
    const o = order({ coupons: [" autumn10 "] });
    const result = applyDiscounts(o, [c], NOW);
    expect(result.coupons[0]?.applied).toBe(true);
  });

  it("rejects a code matching no catalog entry as not_found (AC2)", () => {
    const o = order({ coupons: ["NOPE"] });
    const result = applyDiscounts(o, [], NOW);
    expect(result.coupons[0]).toEqual({ code: "NOPE", applied: false, reason: "not_found" });
  });
});

describe("Story 2.2: reject expired and under-minimum codes with explicit reasons", () => {
  it("rejects a coupon whose expiresAt is on or before asOf (AC1)", () => {
    const c = coupon({ code: "OLD", expiresAt: "2026-01-01T00:00:00.000Z" });
    const o = order({ coupons: ["OLD"] });
    const result = applyDiscounts(o, [c], new Date("2026-01-01T00:00:00.000Z"));
    expect(result.coupons[0]).toEqual({ code: "OLD", applied: false, reason: "expired" });
  });

  it("rejects a coupon whose minSubtotalKopecks exceeds the order's gross item subtotal (AC2)", () => {
    const c = coupon({ code: "BIG", minSubtotalKopecks: 1_000_000 });
    const o = order({ coupons: ["BIG"] });
    const result = applyDiscounts(o, [c], NOW);
    expect(result.coupons[0]).toEqual({ code: "BIG", applied: false, reason: "min_not_met" });
  });

  it("rejects a category coupon whose category has no matching items in the order (AC3)", () => {
    const c = coupon({ code: "DIGI", category: "digital" });
    const o = order({ items: [item({ category: "standard" })], coupons: ["DIGI"] });
    const result = applyDiscounts(o, [c], NOW);
    expect(result.coupons[0]).toEqual({ code: "DIGI", applied: false, reason: "no_matching_items" });
  });
});

describe("Story 2.3: reject duplicate code entries explicitly", () => {
  it("applies the first occurrence once and rejects the second, same-case-folded, occurrence as duplicate (AC1)", () => {
    const c = coupon({ code: "AUTUMN10", value: 10 });
    const o = order({ items: [item({ unitPriceKopecks: 100_000 })], coupons: ["AUTUMN10", "autumn10"] });
    const result = applyDiscounts(o, [c], NOW);
    expect(result.coupons[0]?.applied).toBe(true);
    expect(result.coupons[1]).toEqual({ code: "autumn10", applied: false, reason: "duplicate" });
    expect(result.itemsTotalKopecks).toBe(90_000);
  });

  it("reports the fixed-precedence reason, not duplicate, for every occurrence of a code that fails an earlier check (AC2)", () => {
    const c = coupon({ code: "OLD", expiresAt: "2026-01-01T00:00:00.000Z" });
    const o = order({ coupons: ["OLD", "OLD"] });
    const result = applyDiscounts(o, [c], new Date("2026-01-01T00:00:00.000Z"));
    expect(result.coupons[0]).toEqual({ code: "OLD", applied: false, reason: "expired" });
    expect(result.coupons[1]).toEqual({ code: "OLD", applied: false, reason: "expired" });
  });
});

describe("Story 2.4: cap codes per order", () => {
  const codes = Array.from({ length: 11 }, (_, i) => `CODE${i}`);
  const catalog = codes.map((code) => coupon({ code, value: 1 }));

  it("validates the first 10 entries normally and rejects the 11th as too_many_codes (AC1)", () => {
    const o = order({ coupons: codes });
    const result = applyDiscounts(o, catalog, NOW);
    expect(result.coupons.slice(0, 10).every((c) => c.applied)).toBe(true);
    expect(result.coupons[10]).toEqual({ code: "CODE10", applied: false, reason: "too_many_codes" });
  });

  it("validates all 10 codes normally when exactly 10 are entered (AC2)", () => {
    const o = order({ coupons: codes.slice(0, 10) });
    const result = applyDiscounts(o, catalog, NOW);
    expect(result.coupons).toHaveLength(10);
    expect(result.coupons.every((c) => c.applied)).toBe(true);
  });
});

describe("Story 3.1: apply category-scoped coupons to their own bucket", () => {
  const goldFreshStandard = (coupons: string[]) =>
    order({
      customerTier: "gold",
      items: [
        item({ category: "fresh", unitPriceKopecks: 600 }),
        item({ category: "standard", unitPriceKopecks: 400 }),
      ],
      coupons,
    });

  it("reduces only the coupon's own bucket, leaving other buckets unchanged (AC1)", () => {
    const c = coupon({ code: "FRESH20", category: "fresh", value: 20 });
    const result = applyDiscounts(goldFreshStandard(["FRESH20"]), [c], NOW);
    expect(result.coupons[0]).toEqual({ code: "FRESH20", applied: true, discountKopecks: 108 });
    expect(result.itemsTotalKopecks).toBe(432 + 360);
  });

  it("floors a bucket at 0 when a fixed category coupon exceeds it, without affecting other buckets (AC2)", () => {
    const c = coupon({ code: "FRESHBIG", category: "fresh", kind: "fixed", value: 10_000 });
    const result = applyDiscounts(goldFreshStandard(["FRESHBIG"]), [c], NOW);
    expect(result.coupons[0]).toEqual({ code: "FRESHBIG", applied: true, discountKopecks: 540 });
    expect(result.itemsTotalKopecks).toBe(0 + 360);
  });

  it("computes the discounted items total as the sum of all buckets, with shipping added unmodified on top (AC3)", () => {
    const c = coupon({ code: "FRESH20", category: "fresh", value: 20 });
    const o = goldFreshStandard(["FRESH20"]);
    const result = applyDiscounts(o, [c], NOW);
    expect(result.grandTotalKopecks).toBe(result.itemsTotalKopecks + shippingKopecks(o));
  });
});

describe("Story 3.2: apply non-category coupons proportionally across buckets", () => {
  const goldFreshStandard = (coupons: string[]) =>
    order({
      customerTier: "gold",
      items: [
        item({ category: "fresh", unitPriceKopecks: 600 }),
        item({ category: "standard", unitPriceKopecks: 400 }),
      ],
      coupons,
    });

  it("reduces every bucket by the same exact percentage (AC1)", () => {
    const c = coupon({ code: "SAVE10", value: 10 });
    const result = applyDiscounts(goldFreshStandard(["SAVE10"]), [c], NOW);
    expect(result.itemsTotalKopecks).toBe(486 + 324);
  });

  it("splits a fixed amount proportional to each bucket's current share, flooring each bucket at 0 (AC2)", () => {
    const c = coupon({ code: "SAVE50", kind: "fixed", value: 5_000 });
    const result = applyDiscounts(goldFreshStandard(["SAVE50"]), [c], NOW);
    expect(result.itemsTotalKopecks).toBe(0);
  });

  it("assigns the rounding remainder deterministically to the largest bucket, ties broken by category name ascending (AC3)", () => {
    const c = coupon({ code: "SAVE1", kind: "fixed", value: 1 });
    const o = order({
      customerTier: "none",
      items: [
        item({ category: "standard", unitPriceKopecks: 100 }),
        item({ category: "fresh", unitPriceKopecks: 100 }),
        item({ category: "digital", unitPriceKopecks: 100 }),
      ],
      coupons: ["SAVE1"],
    });
    const r1 = applyDiscounts(o, [c], NOW);
    const r2 = applyDiscounts(o, [c], NOW);
    expect(r1).toEqual(r2);
    // Each raw share (1 * 100/300) rounds to 0; the 1-kopeck remainder goes
    // to the largest bucket, tied buckets broken by category name ascending
    // ("digital" < "fresh" < "standard").
    expect(r1.itemsTotalKopecks).toBe(299);
  });
});

describe("Story 3.3: reject the second code claiming an already-discounted category", () => {
  const catalog = [
    coupon({ code: "FRESH20", category: "fresh", value: 20 }),
    coupon({ code: "FRESHFEST", category: "fresh", value: 15 }),
    coupon({ code: "STD15", category: "standard", value: 15 }),
  ];
  const freshStandardOrder = (coupons: string[]) =>
    order({
      items: [
        item({ category: "fresh", unitPriceKopecks: 1_000 }),
        item({ category: "standard", unitPriceKopecks: 1_000 }),
      ],
      coupons,
    });

  it("applies the first code entered for a category and rejects the second as category_claimed (AC1)", () => {
    const result = applyDiscounts(freshStandardOrder(["FRESH20", "FRESHFEST"]), catalog, NOW);
    expect(result.coupons[0]?.applied).toBe(true);
    expect(result.coupons[1]).toEqual({ code: "FRESHFEST", applied: false, reason: "category_claimed" });
  });

  it("follows entry order, not coupon value, when the entry order is reversed (AC2)", () => {
    const result = applyDiscounts(freshStandardOrder(["FRESHFEST", "FRESH20"]), catalog, NOW);
    expect(result.coupons[0]?.applied).toBe(true);
    expect(result.coupons[1]).toEqual({ code: "FRESH20", applied: false, reason: "category_claimed" });
  });

  it("applies both codes when they target different categories (AC3)", () => {
    const result = applyDiscounts(freshStandardOrder(["FRESH20", "STD15"]), catalog, NOW);
    expect(result.coupons[0]?.applied).toBe(true);
    expect(result.coupons[1]?.applied).toBe(true);
  });
});

describe("Story 4.1: return per-order totals and per-code outcomes", () => {
  it("reports totals plus one outcome per code for a Gold order with one applied and one expired coupon (AC1)", () => {
    const applied = coupon({ code: "SAVE10", value: 10 });
    const expired = coupon({ code: "OLD", expiresAt: "2026-01-01T00:00:00.000Z" });
    const o = order({
      customerTier: "gold",
      items: [item({ unitPriceKopecks: 100_000 })],
      coupons: ["SAVE10", "OLD"],
    });
    const result = applyDiscounts(o, [applied, expired], NOW);
    expect(result.coupons).toHaveLength(2);
    expect(result.coupons[0]).toEqual({ code: "SAVE10", applied: true, discountKopecks: 9_000 });
    expect(result.coupons[1]).toEqual({ code: "OLD", applied: false, reason: "expired" });
    expect(result.grandTotalKopecks).toBe(result.itemsTotalKopecks + result.shippingKopecks);
  });

  it("never returns a negative grand total: the items total floors at 0 and shipping is never reduced (AC2)", () => {
    const c = coupon({ code: "HUGE", kind: "fixed", value: 1_000_000 });
    const o = order({ coupons: ["HUGE"] });
    const result = applyDiscounts(o, [c], NOW);
    expect(result.itemsTotalKopecks).toBe(0);
    expect(result.shippingKopecks).toBe(shippingKopecks(o));
    expect(result.grandTotalKopecks).toBeGreaterThanOrEqual(0);
  });

  it("matches today's undiscounted behavior for zero coupons entered and customerTier none (AC3)", () => {
    const o = order({ customerTier: "none", coupons: [] });
    const result = applyDiscounts(o, [], NOW);
    expect(result.coupons).toEqual([]);
    expect(result.itemsTotalKopecks).toBe(subtotalKopecks(o));
    expect(result.grandTotalKopecks).toBe(subtotalKopecks(o) + shippingKopecks(o));
  });
});

describe("Story 4.2: existing pricing.ts contract is untouched", () => {
  it("leaves subtotalKopecks and tierPercent behavior unchanged; full regression lives in pricing.test.ts (AC1, AC2)", () => {
    const o = order({ items: [item({ unitPriceKopecks: 50_000, quantity: 2 })] });
    expect(subtotalKopecks(o)).toBe(100_000);
    expect(tierPercent(order({ customerTier: "gold" }))).toBe(10);
  });
});
