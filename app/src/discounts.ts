import type { Order, Coupon } from "./types.js";
import {
  lineTotalKopecks,
  subtotalKopecks,
  shippingKopecks,
  tierPercent,
} from "./pricing.js";

/** Чому промокод не спрацював. Машинна причина, не текст для людини (D-8). */
export type RejectionReason =
  | "unknown" // коду немає в каталозі (D-9)
  | "invalid" // дані купона суперечать types.ts (D-17)
  | "expired" // now >= expiresAt (D-12)
  | "below-min-subtotal" // сирий subtotal < minSubtotalKopecks (D-6)
  | "no-matching-items" // категорійний купон, товарів категорії немає (D-14)
  | "not-best"; // валідний, але інший дав більшу знижку (D-3)

export interface AppliedCoupon {
  code: string;
  /** Фактично надана знижка в копійках, уже округлена вниз (D-4). */
  discountKopecks: number;
}

export interface RejectedCoupon {
  code: string;
  reason: RejectionReason;
}

export interface PriceBreakdown {
  /** Сума товарів до будь-яких знижок — `subtotalKopecks(order)`. */
  subtotalKopecks: number;
  /** Знижка рівня, floor(subtotal × tierPercent ÷ 100) (D-4, D-11). */
  tierDiscountKopecks: number;
  /** Знижка єдиного застосованого промокоду; 0, якщо жодного (D-3). */
  couponDiscountKopecks: number;
  /** Застосований промокод або null. */
  appliedCoupon: AppliedCoupon | null;
  /**
   * Кожен унікальний введений код, що не був застосований — **у порядку
   * введення**, незалежно від причини (D-3, D-10, AC-15а).
   */
  rejectedCoupons: RejectedCoupon[];
  /** Доставка — `shippingKopecks(order)`, ніколи не дисконтується (D-2). */
  shippingKopecks: number;
  /** До сплати. Ніколи не менше за shippingKopecks (D-7). */
  totalKopecks: number;
}

/**
 * Чиста функція. Ніколи не кидає винятків (D-8).
 * Усі поля результату — цілі копійки.
 *
 * @param order    замовлення; `order.coupons` — введені коди в порядку вводу
 * @param catalog  доступні купони; зіставлення з кодом точне, без нормалізації
 * @param now      момент оцінки терміну дії; інʼєктується заради
 *                 детермінованості граничних тестів (D-12)
 */
export function priceOrder(
  order: Order,
  catalog: Coupon[],
  now: Date = new Date(),
): PriceBreakdown {
  // Step 1: subtotal
  const subtotal = subtotalKopecks(order);

  // Step 2: tierDiscount
  const tierPercent_ = tierPercent(order);
  const tierDiscount = Math.floor((subtotal * tierPercent_) / 100);

  // Step 3: Deduplicate order.coupons, keeping first occurrence (D-10)
  const seenCodes = new Set<string>();
  const uniqueCodes: string[] = [];
  for (const code of order.coupons) {
    if (!seenCodes.has(code)) {
      seenCodes.add(code);
      uniqueCodes.push(code);
    }
  }

  // Step 4: For each unique code, determine reason or calculate discount
  interface CandidateInfo {
    code: string;
    discount: number;
    orderPosition: number;
  }

  interface RejectionInfo {
    code: string;
    reason: RejectionReason;
  }

  const candidates: CandidateInfo[] = [];
  const rejections: Map<string, RejectionInfo> = new Map();

  for (let i = 0; i < uniqueCodes.length; i++) {
    const code = uniqueCodes[i]!;

    // 4a: Check if in catalog
    const coupon = catalog.find((c) => c.code === code);
    if (!coupon) {
      rejections.set(code, { code, reason: "unknown" });
      continue;
    }

    // 4b: Check validity of coupon data (D-17, before expiry check)
    if (
      !Number.isFinite(coupon.value) ||
      coupon.value < 0 ||
      (coupon.kind === "percent" && coupon.value > 100) ||
      (coupon.kind === "fixed" && !Number.isInteger(coupon.value)) ||
      Number.isNaN(Date.parse(coupon.expiresAt))
    ) {
      rejections.set(code, { code, reason: "invalid" });
      continue;
    }

    // 4c: Check expiry (D-12)
    if (now.getTime() >= Date.parse(coupon.expiresAt)) {
      rejections.set(code, { code, reason: "expired" });
      continue;
    }

    // 4d: Check min subtotal against raw subtotal (D-6)
    if (
      coupon.minSubtotalKopecks != null &&
      subtotal < coupon.minSubtotalKopecks
    ) {
      rejections.set(code, { code, reason: "below-min-subtotal" });
      continue;
    }

    // 4e: Check if category exists (D-14)
    const category = coupon.category;
    if (category != null) {
      const hasCategoryItems = order.items.some(
        (item) => item.category === category
      );
      if (!hasCategoryItems) {
        rejections.set(code, { code, reason: "no-matching-items" });
        continue;
      }
    }

    // Otherwise: candidate
    let discount: number;

    if (category != null) {
      // Category-specific coupon (D-5)
      const categorySubtotal = order.items
        .filter((item) => item.category === category)
        .reduce((sum, item) => sum + lineTotalKopecks(item), 0);

      const categoryTierDiscount = Math.floor(
        (categorySubtotal * tierPercent_) / 100
      );
      const categoryBase = categorySubtotal - categoryTierDiscount;

      if (coupon.kind === "percent") {
        discount = Math.floor((categoryBase * coupon.value) / 100);
      } else {
        // fixed (D-15)
        discount = Math.min(coupon.value, categoryBase);
      }
    } else {
      // Order-wide coupon (D-5)
      const base = subtotal - tierDiscount;

      if (coupon.kind === "percent") {
        discount = Math.floor((base * coupon.value) / 100);
      } else {
        // fixed (D-15)
        discount = Math.min(coupon.value, base);
      }
    }

    candidates.push({ code, discount, orderPosition: i });
  }

  // Step 5: Pick best candidate (D-3, D-16)
  let appliedCoupon: AppliedCoupon | null = null;
  let couponDiscount = 0;

  if (candidates.length > 0) {
    // Sort by discount (desc), then by order position (asc)
    candidates.sort((a, b) => {
      if (b.discount !== a.discount) {
        return b.discount - a.discount;
      }
      return a.orderPosition - b.orderPosition;
    });

    const best = candidates[0]!;
    appliedCoupon = {
      code: best.code,
      discountKopecks: best.discount,
    };
    couponDiscount = best.discount;

    // Mark others as not-best
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      rejections.set(candidate.code, {
        code: candidate.code,
        reason: "not-best",
      });
    }
  }

  // Step 6: Collect rejectedCoupons in order of introduction (D-3, D-10)
  const rejectedCoupons: RejectedCoupon[] = [];
  for (const code of uniqueCodes) {
    const rejection = rejections.get(code);
    if (rejection) {
      rejectedCoupons.push(rejection);
    }
  }

  // Step 7: Calculate goods after discounts (D-7)
  const goods = Math.max(0, subtotal - tierDiscount - couponDiscount);

  // Step 8: Add shipping (D-2)
  const shipping = shippingKopecks(order);
  const total = goods + shipping;

  return {
    subtotalKopecks: subtotal,
    tierDiscountKopecks: tierDiscount,
    couponDiscountKopecks: couponDiscount,
    appliedCoupon,
    rejectedCoupons,
    shippingKopecks: shipping,
    totalKopecks: total,
  };
}
