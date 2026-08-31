import { describe, it, expect } from "vitest";
import { priceOrder } from "./discounts.js";
import type { Order, LineItem, Coupon } from "./types.js";

// Test helpers
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
  code: "TEST",
  kind: "percent",
  value: 10,
  expiresAt: "2026-09-30T23:59:59.999Z",
  ...over,
});

// AC-1: рівень нарешті працює
it("AC-1: рівень нарешті працює", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 100_000, quantity: 1 })],
    customerTier: "gold",
    coupons: [],
  });

  const result = priceOrder(o, []);

  expect(result.subtotalKopecks).toBe(100_000);
  expect(result.tierDiscountKopecks).toBe(10_000);
  expect(result.couponDiscountKopecks).toBe(0);
  expect(result.appliedCoupon).toBeNull();
  expect(result.shippingKopecks).toBe(4_900);
  expect(result.totalKopecks).toBe(94_900);
});

// AC-2: прострочений промокод не спрацьовує
it("AC-2: прострочений промокод не спрацьовує", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 100_000, quantity: 1 })],
    customerTier: "silver",
    coupons: ["SAVE15"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "SAVE15",
      kind: "percent",
      value: 15,
      expiresAt: "2026-08-01T00:00:00.000Z",
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  expect(result.couponDiscountKopecks).toBe(0);
  expect(result.appliedCoupon).toBeNull();
  expect(result.rejectedCoupons).toEqual([
    { code: "SAVE15", reason: "expired" },
  ]);
  expect(result.tierDiscountKopecks).toBe(5_000);
  expect(result.subtotalKopecks).toBe(100_000);
  expect(result.shippingKopecks).toBe(4_900);
  expect(result.totalKopecks).toBe(99_900);
});

// AC-3: два промокоди на одну категорію
it("AC-3: два промокоди на одну категорію", () => {
  const o = order({
    items: [
      item({ category: "fresh", unitPriceKopecks: 40_000, quantity: 1 }),
      item({ category: "standard", unitPriceKopecks: 60_000, quantity: 1 }),
    ],
    customerTier: "silver",
    coupons: ["FRESH20", "FRESH50"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "FRESH20",
      kind: "percent",
      value: 20,
      category: "fresh",
    }),
    coupon({
      code: "FRESH50",
      kind: "fixed",
      value: 5_000,
      category: "fresh",
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  // Base category = 40_000 - floor(40_000 × 5 ÷ 100) = 40_000 - 2_000 = 38_000
  // FRESH20: floor(38_000 × 20 ÷ 100) = 7_600
  // FRESH50: min(5_000, 38_000) = 5_000
  // FRESH20 wins (7_600 > 5_000)
  expect(result.subtotalKopecks).toBe(100_000);
  expect(result.couponDiscountKopecks).toBe(7_600);
  expect(result.appliedCoupon).toEqual({
    code: "FRESH20",
    discountKopecks: 7_600,
  });
  expect(result.rejectedCoupons).toEqual([
    { code: "FRESH50", reason: "not-best" },
  ]);
  // tierDiscount = floor(100_000 × 5 ÷ 100) = 5_000
  // total = 100_000 - 5_000 - 7_600 + 4_900 = 92_300
  expect(result.totalKopecks).toBe(92_300);
});

// AC-4: знижка перевищує суму замовлення
it("AC-4: знижка перевищує суму замовлення", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 10_000, quantity: 1 })],
    customerTier: "none",
    coupons: ["MEGA"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "MEGA",
      kind: "fixed",
      value: 200_000,
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  expect(result.subtotalKopecks).toBe(10_000);
  expect(result.couponDiscountKopecks).toBe(10_000);
  expect(result.appliedCoupon).toEqual({
    code: "MEGA",
    discountKopecks: 10_000,
  });
  // goods = max(0, 10_000 - 0 - 10_000) = 0
  // total = 0 + 4_900 = 4_900
  expect(result.totalKopecks).toBe(4_900);
  expect(result.totalKopecks).toBeGreaterThanOrEqual(result.shippingKopecks);
});

// AC-5: рівень і промокод разом, послідовно
it("AC-5: рівень і промокод разом, послідовно", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 100_000, quantity: 1 })],
    customerTier: "gold",
    coupons: ["AUTUMN15"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "AUTUMN15",
      kind: "percent",
      value: 15,
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  // tierDiscount = floor(100_000 × 10 ÷ 100) = 10_000
  // base for coupon = 100_000 - 10_000 = 90_000
  // couponDiscount = floor(90_000 × 15 ÷ 100) = 13_500
  // goods = 100_000 - 10_000 - 13_500 = 76_500
  // total = 76_500 + 4_900 = 81_400
  expect(result.tierDiscountKopecks).toBe(10_000);
  expect(result.couponDiscountKopecks).toBe(13_500);
  expect(result.totalKopecks).toBe(81_400);
});

// AC-6: категорійний промокод рахується від категорії
it("AC-6: категорійний промокод рахується від категорії", () => {
  const o = order({
    items: [
      item({ category: "fresh", unitPriceKopecks: 40_000, quantity: 1 }),
      item({ category: "standard", unitPriceKopecks: 60_000, quantity: 1 }),
    ],
    customerTier: "silver",
    coupons: ["FRESH20"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "FRESH20",
      kind: "percent",
      value: 20,
      category: "fresh",
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  // categorySubtotal for fresh = 40_000
  // categoryTierDiscount = floor(40_000 × 5 ÷ 100) = 2_000
  // categoryBase = 40_000 - 2_000 = 38_000
  // couponDiscount = floor(38_000 × 20 ÷ 100) = 7_600
  // tierDiscount for whole order = floor(100_000 × 5 ÷ 100) = 5_000
  // goods = 100_000 - 5_000 - 7_600 = 87_400
  // total = 87_400 + 4_900 = 92_300
  expect(result.couponDiscountKopecks).toBe(7_600);
  expect(result.totalKopecks).toBe(92_300);
});

// AC-7: поріг перевіряється до знижок
it("AC-7: поріг перевіряється до знижок", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 100_000, quantity: 1 })],
    customerTier: "gold",
    coupons: ["BIG10"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "BIG10",
      kind: "percent",
      value: 10,
      minSubtotalKopecks: 100_000,
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  // subtotal = 100_000, minSubtotalKopecks = 100_000, so 100_000 >= 100_000 ✓
  // tierDiscount = floor(100_000 × 10 ÷ 100) = 10_000
  // base for coupon = 100_000 - 10_000 = 90_000
  // couponDiscount = floor(90_000 × 10 ÷ 100) = 9_000
  // goods = 100_000 - 10_000 - 9_000 = 81_000
  // total = 81_000 + 4_900 = 85_900
  expect(result.appliedCoupon?.code).toBe("BIG10");
  expect(result.couponDiscountKopecks).toBe(9_000);
  expect(result.totalKopecks).toBe(85_900);
});

// AC-8: пів копійки при округленні
it("AC-8: пів копійки при округленні", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 33_333, quantity: 1 })],
    customerTier: "none",
    coupons: ["P15"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "P15",
      kind: "percent",
      value: 15,
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  // 33_333 × 15 ÷ 100 = 4_999.95, floor to 4_999
  expect(result.couponDiscountKopecks).toBe(4_999);
  const goods = 33_333 - 0 - 4_999; // 28_334
  expect(result.subtotalKopecks).toBe(33_333);
  expect(goods).toBe(28_334);
  expect(result.totalKopecks).toBe(33_234);
  // All fields should be integers
  expect(Number.isInteger(result.subtotalKopecks)).toBe(true);
  expect(Number.isInteger(result.tierDiscountKopecks)).toBe(true);
  expect(Number.isInteger(result.couponDiscountKopecks)).toBe(true);
  expect(Number.isInteger(result.shippingKopecks)).toBe(true);
  expect(Number.isInteger(result.totalKopecks)).toBe(true);

  // Exact boundary: 5 × 10 ÷ 100 = 0.5 — half a kopeck exactly
  const half = order({
    items: [item({ unitPriceKopecks: 5, quantity: 1 })],
    customerTier: "none",
    coupons: ["P10"],
  });

  const halfResult = priceOrder(
    half,
    [coupon({ code: "P10", kind: "percent", value: 10 })],
    now
  );

  // floor(0.5) = 0; rounding to nearest would give 1
  expect(halfResult.couponDiscountKopecks).toBe(0);
  expect(halfResult.appliedCoupon).toEqual({ code: "P10", discountKopecks: 0 });
  expect(halfResult.totalKopecks).toBe(4_905);
});

// AC-9: порожнє замовлення
it("AC-9: порожнє замовлення", () => {
  const o = order({
    items: [],
    customerTier: "gold",
    coupons: [],
  });

  const result = priceOrder(o, []);

  expect(result.subtotalKopecks).toBe(0);
  expect(result.tierDiscountKopecks).toBe(0);
  expect(result.couponDiscountKopecks).toBe(0);
  expect(result.shippingKopecks).toBe(0);
  expect(result.totalKopecks).toBe(0);
});

// AC-10: невідомий код
it("AC-10: невідомий код", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 100_000, quantity: 1 })],
    customerTier: "none",
    coupons: ["NOSUCHCODE"],
  });

  const result = priceOrder(o, []);

  expect(result.rejectedCoupons).toEqual([
    { code: "NOSUCHCODE", reason: "unknown" },
  ]);
  expect(result.couponDiscountKopecks).toBe(0);
  expect(result.appliedCoupon).toBeNull();
  expect(result.totalKopecks).toBe(104_900);
});

// AC-11a: у момент закінчення купон уже не діє
it("AC-11a: у момент закінчення купон уже не діє", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 100_000, quantity: 1 })],
    customerTier: "none",
    coupons: ["EDGE"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "EDGE",
      kind: "percent",
      value: 10,
      expiresAt: "2026-09-01T00:00:00.000Z",
    }),
  ];

  const now = new Date("2026-09-01T00:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  expect(result.rejectedCoupons).toEqual([{ code: "EDGE", reason: "expired" }]);
  expect(result.couponDiscountKopecks).toBe(0);
});

// AC-11b: за мілісекунду до закінчення купон діє
it("AC-11b: за мілісекунду до закінчення купон діє", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 100_000, quantity: 1 })],
    customerTier: "none",
    coupons: ["EDGE"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "EDGE",
      kind: "percent",
      value: 10,
      expiresAt: "2026-09-01T00:00:00.000Z",
    }),
  ];

  const now = new Date("2026-08-31T23:59:59.999Z");
  const result = priceOrder(o, catalog, now);

  expect(result.appliedCoupon?.code).toBe("EDGE");
  expect(result.couponDiscountKopecks).toBe(10_000);
  expect(result.rejectedCoupons).toEqual([]);
});

// AC-12: дубльований код
it("AC-12: дубльований код", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 100_000, quantity: 1 })],
    customerTier: "none",
    coupons: ["SAVE10", "SAVE10"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "SAVE10",
      kind: "percent",
      value: 10,
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  // Should apply only once
  expect(result.couponDiscountKopecks).toBe(10_000);
  expect(result.appliedCoupon?.code).toBe("SAVE10");
  expect(result.rejectedCoupons).toEqual([]);
  expect(result.totalKopecks).toBe(94_900);
});

// AC-13: категорійний купон без відповідних товарів
it("AC-13: категорійний купон без відповідних товарів", () => {
  const o = order({
    items: [item({ category: "standard", unitPriceKopecks: 100_000, quantity: 1 })],
    customerTier: "none",
    coupons: ["FRESH20"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "FRESH20",
      kind: "percent",
      value: 20,
      category: "fresh",
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  expect(result.rejectedCoupons).toEqual([
    { code: "FRESH20", reason: "no-matching-items" },
  ]);
  expect(result.couponDiscountKopecks).toBe(0);
  expect(result.appliedCoupon).toBeNull();
});

// AC-14: поріг не досягнуто
it("AC-14: поріг не досягнуто", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 99_999, quantity: 1 })],
    customerTier: "none",
    coupons: ["BIG10"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "BIG10",
      kind: "percent",
      value: 10,
      minSubtotalKopecks: 100_000,
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  expect(result.rejectedCoupons).toEqual([
    { code: "BIG10", reason: "below-min-subtotal" },
  ]);
  expect(result.couponDiscountKopecks).toBe(0);
});

// AC-15: інваріант повноти й сходимості розкладки
// Property test: for any order and any set of valid coupons:
// (a) codes in rejectedCoupons + appliedCoupon?.code form exactly the set of unique input codes, each once, in order
// (b) goods >= 0
// (c) total = subtotal - tierDiscount - couponDiscount + shipping
// (d) all numeric fields are integers
it("AC-15: інваріант повноти й сходимості розкладки", () => {
  // 3 000 generated orders — AC-15 is a property, not an example (spec §6)
  const random = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  const now = new Date("2026-08-30T12:00:00.000Z");

  const baseCatalog: Coupon[] = [
    coupon({ code: "P5", kind: "percent", value: 5 }),
    coupon({ code: "P10", kind: "percent", value: 10 }),
    coupon({ code: "P20", kind: "percent", value: 20 }),
    coupon({ code: "F100", kind: "fixed", value: 10_000 }),
    coupon({ code: "F200", kind: "fixed", value: 20_000 }),
    coupon({ code: "FRESH10", kind: "percent", value: 10, category: "fresh" }),
  ];

  for (let testCase = 0; testCase < 3000; testCase++) {
    // Random order structure
    const itemCount = random(0, 5);
    const items: LineItem[] = [];
    for (let i = 0; i < itemCount; i++) {
      items.push(
        item({
          unitPriceKopecks: random(1_000, 50_000),
          quantity: random(1, 5),
          category: ["standard", "fresh", "digital"][
            random(0, 2)
          ] as "standard" | "fresh" | "digital",
        })
      );
    }

    const tier =
      ["none", "silver", "gold"][random(0, 2)]! as "none" | "silver" | "gold";
    const couponCodes: string[] = [];
    const couponCount = random(0, 4);
    for (let i = 0; i < couponCount; i++) {
      couponCodes.push(
        baseCatalog[random(0, baseCatalog.length - 1)]!.code
      );
    }

    const testOrder = order({
      items,
      customerTier: tier,
      coupons: couponCodes,
    });

    const result = priceOrder(testOrder, baseCatalog, now);

    // (a) Completeness and order: every unique entered code is accounted for
    // exactly once, and rejections keep the order the codes were entered in
    const uniqueCodes = [...new Set(couponCodes)];
    const appliedCode = result.appliedCoupon?.code;

    expect(result.rejectedCoupons.map((r) => r.code)).toEqual(
      uniqueCodes.filter((code) => code !== appliedCode)
    );
    if (appliedCode !== undefined) {
      expect(uniqueCodes).toContain(appliedCode);
    }

    // (b) Goods >= 0
    const goods = result.subtotalKopecks - result.tierDiscountKopecks - result.couponDiscountKopecks;
    expect(goods).toBeGreaterThanOrEqual(0);

    // (c) Convergence
    const calculatedTotal =
      result.subtotalKopecks -
      result.tierDiscountKopecks -
      result.couponDiscountKopecks +
      result.shippingKopecks;
    expect(result.totalKopecks).toBe(calculatedTotal);

    // (d) Integrality
    expect(Number.isInteger(result.subtotalKopecks)).toBe(true);
    expect(Number.isInteger(result.tierDiscountKopecks)).toBe(true);
    expect(Number.isInteger(result.couponDiscountKopecks)).toBe(true);
    expect(Number.isInteger(result.shippingKopecks)).toBe(true);
    expect(Number.isInteger(result.totalKopecks)).toBe(true);
  }
});

// AC-16: нічия між промокодами
it("AC-16: нічия між промокодами", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 100_000, quantity: 1 })],
    customerTier: "none",
    coupons: ["TIE_B", "TIE_A"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "TIE_A",
      kind: "percent",
      value: 10,
    }),
    coupon({
      code: "TIE_B",
      kind: "fixed",
      value: 10_000,
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  // Both give 10_000, but TIE_B was entered first
  expect(result.appliedCoupon).toEqual({
    code: "TIE_B",
    discountKopecks: 10_000,
  });
  expect(result.rejectedCoupons).toEqual([{ code: "TIE_A", reason: "not-best" }]);
  expect(result.totalKopecks).toBe(94_900);
});

// AC-17: відсоток поза контрактом
it("AC-17: відсоток поза контрактом", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 10_000, quantity: 1 })],
    customerTier: "none",
    coupons: ["BROKEN"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "BROKEN",
      kind: "percent",
      value: 150,
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  expect(result.rejectedCoupons).toEqual([
    { code: "BROKEN", reason: "invalid" },
  ]);
  expect(result.couponDiscountKopecks).toBe(0);
  expect(result.totalKopecks).toBe(14_900);
});

// AC-18: нерозбірна дата закінчення
it("AC-18: нерозбірна дата закінчення", () => {
  const o = order({
    items: [item({ unitPriceKopecks: 10_000, quantity: 1 })],
    customerTier: "none",
    coupons: ["JUNKDATE"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "JUNKDATE",
      kind: "percent",
      value: 10,
      expiresAt: "не дата",
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  expect(result.rejectedCoupons).toEqual([
    { code: "JUNKDATE", reason: "invalid" },
  ]);
  expect(result.appliedCoupon).toBeNull();
  expect(result.totalKopecks).toBe(14_900);
});

// AC-19: порівняння за копійками, а не за відсотками
it("AC-19: порівняння за копійками, а не за відсотками", () => {
  const o = order({
    items: [
      item({ category: "fresh", unitPriceKopecks: 5_000, quantity: 1 }),
      item({ category: "standard", unitPriceKopecks: 95_000, quantity: 1 }),
    ],
    customerTier: "none",
    coupons: ["WIDE5", "FRESH50"],
  });

  const catalog: Coupon[] = [
    coupon({
      code: "WIDE5",
      kind: "percent",
      value: 5,
    }),
    coupon({
      code: "FRESH50",
      kind: "percent",
      value: 50,
      category: "fresh",
    }),
  ];

  const now = new Date("2026-08-30T12:00:00.000Z");
  const result = priceOrder(o, catalog, now);

  // WIDE5: floor(100_000 × 5 ÷ 100) = 5_000
  // FRESH50: categorySubtotal = 5_000, no tier discount (none tier)
  //          floor(5_000 × 50 ÷ 100) = 2_500
  // WIDE5 wins (5_000 > 2_500)
  expect(result.couponDiscountKopecks).toBe(5_000);
  expect(result.appliedCoupon?.code).toBe("WIDE5");
  expect(result.rejectedCoupons).toEqual([
    { code: "FRESH50", reason: "not-best" },
  ]);
  expect(result.totalKopecks).toBe(99_900);
});
