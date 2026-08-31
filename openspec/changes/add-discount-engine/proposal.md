## Why

`tierPercent()` exists in `src/pricing.ts` but nothing calls it, and promo codes
do not exist at all — every order is billed at full item value plus shipping, so
neither loyalty tiers nor marketing campaigns affect a single kopeck today.

The business also needs an upper bound it can state in advance: with discounts
stacking additively, three concurrent campaigns can exceed 100% and require a
separate guard. Sequential application (tier first, then one coupon on the
remainder) gives a deterministic ceiling for free.

All decisions are already made and recorded in `docs/spec/pricing-discounts.md`
(D-1…D-17, AC-1…AC-19). This change carries them into the codebase; it does not
re-open them.

## What Changes

- New module `app/src/discounts.ts` exporting one pure function
  `priceOrder(order, catalog, now?) → PriceBreakdown`, plus the supporting types
  `RejectionReason`, `AppliedCoupon`, `RejectedCoupon`, `PriceBreakdown`.
- Customer tier finally reduces the bill: `floor(subtotal × tierPercent ÷ 100)`,
  applied to the whole item subtotal (D-11).
- Coupon support: at most **one** coupon per order — the one worth the most
  kopecks (D-3, D-16). It applies to what the tier discount left behind, not to
  the raw subtotal (D-1).
- Shipping is never discounted and is added after the goods total is floored at
  zero, so `total >= shippingKopecks` always (D-2, D-7).
- Every code the customer typed that did not apply comes back in
  `rejectedCoupons` with a machine reason (`unknown`, `invalid`, `expired`,
  `below-min-subtotal`, `no-matching-items`, `not-best`) — the function never
  throws (D-8).
- Coupons whose data contradicts `types.ts` (`percent > 100`, negative or
  non-finite `value`, non-integer `fixed` value, unparseable `expiresAt`) are
  rejected as `invalid` **before** the expiry check (D-17).
- New test file `app/src/discounts.test.ts` with one test per acceptance
  criterion, named after its AC id.
- Re-export the new public surface from `app/src/index.ts`.
- No breaking changes: `types.ts` and `pricing.ts` are untouched.

## Capabilities

### New Capabilities
- `discount-engine`: computing an order's price breakdown — tier discount,
  a single best coupon discount, undiscounted shipping, and a per-code
  rejection reason for every coupon that did not apply.

### Modified Capabilities
<!-- None. `pricing.ts` and `types.ts` are the seeded contract and stay as they are. -->

## Impact

- **New**: `app/src/discounts.ts`, `app/src/discounts.test.ts`.
- **Modified**: `app/src/index.ts` (export the new surface only).
- **Untouched (guardrail)**: `app/src/pricing.ts`, `app/src/types.ts` — signatures
  and shapes are the seeded contract; `materials/feature-request.md`.
- **Dependencies**: none added. Pure TypeScript, existing vitest.
- **Consumers**: the checkout UI gains a breakdown it can render line by line,
  including why each rejected code failed — but no UI work is in this change.
- **Out of scope** (per §2 of the spec): coupon persistence, code normalisation
  (trim/uppercase), usage limits, shipping discounts, multi-currency/VAT,
  per-SKU coupons, i18n of rejection reasons.
