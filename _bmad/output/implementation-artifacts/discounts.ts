// Discount engine: loyalty tier + stacking promo codes. Built alongside
// pricing.ts, not a replacement for it — reuses lineTotalKopecks,
// subtotalKopecks, shippingKopecks, tierPercent rather than recomputing them.
// All amounts stay whole kopecks throughout; no floats represent money.

import type { Coupon, LineItem, Order } from "./types.js";
import { lineTotalKopecks, shippingKopecks, subtotalKopecks, tierPercent } from "./pricing.js";

export type RejectionReason =
  | "not_found"
  | "expired"
  | "min_not_met"
  | "no_matching_items"
  | "category_claimed"
  | "duplicate"
  | "too_many_codes";

export interface CouponOutcome {
  /** Echoes the original as-typed string from order.coupons, untrimmed, original case. */
  code: string;
  applied: boolean;
  discountKopecks?: number;
  reason?: RejectionReason;
}

export interface DiscountResult {
  itemsTotalKopecks: number;
  shippingKopecks: number;
  grandTotalKopecks: number;
  coupons: CouponOutcome[];
}

type Category = LineItem["category"];

/** One running remaining-subtotal per category present in the order. */
type Buckets = Partial<Record<Category, number>>;

const MAX_CODES = 10;

const normalizeCode = (code: string): string => code.trim().toLowerCase();

/**
 * Every bucket is seeded once, up front, for every category present in
 * order.items, and no step ever deletes a key — so this read is
 * non-undefined by construction for any category known to have a bucket.
 */
function getBucket(buckets: Buckets, category: Category): number {
  const value = buckets[category];
  if (value === undefined) {
    throw new Error(`internal error: no bucket initialized for category "${category}"`);
  }
  return value;
}

function initBuckets(order: Order): Buckets {
  const buckets: Buckets = {};
  for (const item of order.items) {
    buckets[item.category] = (buckets[item.category] ?? 0) + lineTotalKopecks(item);
  }
  return buckets;
}

function reduceBucketByPercent(buckets: Buckets, category: Category, percent: number): number {
  const before = getBucket(buckets, category);
  const after = Math.max(0, before - Math.round((before * percent) / 100));
  buckets[category] = after;
  return before - after;
}

function reduceAllBucketsByPercent(buckets: Buckets, categories: Category[], percent: number): number {
  return categories.reduce((sum, cat) => sum + reduceBucketByPercent(buckets, cat, percent), 0);
}

function reduceBucketByFixed(buckets: Buckets, category: Category, amountKopecks: number): number {
  const before = getBucket(buckets, category);
  const after = Math.max(0, before - amountKopecks);
  buckets[category] = after;
  return before - after;
}

/**
 * Splits a whole-order fixed amount across every bucket proportional to its
 * current share, rounded half-up per bucket. With at most 3 category
 * buckets, the rounded shares can differ from the exact target by at most 1
 * kopeck; that single leftover/shortfall goes to the bucket with the
 * largest current value (ties broken by category name ascending).
 */
function applyProportionalFixed(buckets: Buckets, categories: Category[], amountKopecks: number): number {
  const total = categories.reduce((sum, cat) => sum + getBucket(buckets, cat), 0);
  if (total <= 0) return 0;

  const shares = new Map<Category, number>();
  let sumRounded = 0;
  for (const cat of categories) {
    const share = Math.round((amountKopecks * getBucket(buckets, cat)) / total);
    shares.set(cat, share);
    sumRounded += share;
  }

  const remainder = amountKopecks - sumRounded;
  if (remainder !== 0) {
    const target = categories
      .slice()
      .sort((a, b) => getBucket(buckets, b) - getBucket(buckets, a) || (a < b ? -1 : 1))[0];
    // total > 0 guarantees categories is non-empty.
    shares.set(target as Category, (shares.get(target as Category) ?? 0) + remainder);
  }

  let discount = 0;
  for (const cat of categories) {
    const before = getBucket(buckets, cat);
    const after = Math.max(0, before - (shares.get(cat) ?? 0));
    buckets[cat] = after;
    discount += before - after;
  }
  return discount;
}

function applyCoupon(buckets: Buckets, categories: Category[], coupon: Coupon): number {
  if (coupon.category !== undefined) {
    return coupon.kind === "percent"
      ? reduceBucketByPercent(buckets, coupon.category, coupon.value)
      : reduceBucketByFixed(buckets, coupon.category, coupon.value);
  }
  return coupon.kind === "percent"
    ? reduceAllBucketsByPercent(buckets, categories, coupon.value)
    : applyProportionalFixed(buckets, categories, coupon.value);
}

/**
 * Applies the customer's tier discount, then every entered coupon in entry
 * order, to one order. asOf is required — no internal clock, no default:
 * a caller (e.g. index.ts or a checkout handler) supplies `new Date()`.
 */
export function applyDiscounts(order: Order, coupons: Coupon[], asOf: Date): DiscountResult {
  const buckets = initBuckets(order);
  const categories = (Object.keys(buckets) as Category[]).sort();

  reduceAllBucketsByPercent(buckets, categories, tierPercent(order));

  const grossSubtotal = subtotalKopecks(order);
  const claimedBy: Partial<Record<Category, string>> = {};
  const seenCodes = new Set<string>();
  const outcomes: CouponOutcome[] = [];

  order.coupons.forEach((typed, index) => {
    if (index >= MAX_CODES) {
      outcomes.push({ code: typed, applied: false, reason: "too_many_codes" });
      return;
    }

    const normalized = normalizeCode(typed);
    const coupon = coupons.find((c) => normalizeCode(c.code) === normalized);

    const reject = (reason: RejectionReason): void => {
      seenCodes.add(normalized);
      outcomes.push({ code: typed, applied: false, reason });
    };

    if (!coupon) return reject("not_found");
    if (new Date(coupon.expiresAt) <= asOf) return reject("expired");
    if (coupon.minSubtotalKopecks !== undefined && coupon.minSubtotalKopecks > grossSubtotal) {
      return reject("min_not_met");
    }
    if (coupon.category !== undefined && buckets[coupon.category] === undefined) {
      return reject("no_matching_items");
    }
    if (
      coupon.category !== undefined &&
      claimedBy[coupon.category] !== undefined &&
      claimedBy[coupon.category] !== normalized
    ) {
      return reject("category_claimed");
    }
    if (seenCodes.has(normalized)) return reject("duplicate");

    seenCodes.add(normalized);
    const discountKopecks = applyCoupon(buckets, categories, coupon);
    if (coupon.category !== undefined) {
      claimedBy[coupon.category] = normalized;
    }
    outcomes.push({ code: typed, applied: true, discountKopecks });
  });

  const itemsTotalKopecks = categories.reduce((sum, cat) => sum + getBucket(buckets, cat), 0);
  const shipping = shippingKopecks(order);

  return {
    itemsTotalKopecks,
    shippingKopecks: shipping,
    grandTotalKopecks: itemsTotalKopecks + shipping,
    coupons: outcomes,
  };
}
