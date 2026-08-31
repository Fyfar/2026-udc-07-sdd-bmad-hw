## 1. Module skeleton

- [ ] 1.1 Create `app/src/discounts.ts` with the exported types `RejectionReason`, `AppliedCoupon`, `RejectedCoupon`, `PriceBreakdown` and the `priceOrder(order, catalog, now = new Date())` signature returning a hard-coded zero breakdown; verify `npm run typecheck` passes with no `any`
- [ ] 1.2 Create `app/src/discounts.test.ts` importing `priceOrder` with one placeholder case; verify `npm test` runs the new file (8 existing tests still green)

## 2. Tier discount

- [ ] 2.1 Compute `subtotal = subtotalKopecks(order)` and `tierDiscount = Math.floor(subtotal * tierPercent(order) / 100)`, and assemble `total = max(0, subtotal − tierDiscount) + shippingKopecks(order)`; verify the `AC-1` test (gold, 100 000 → 10 000 / 4 900 / 94 900) passes
- [ ] 2.2 Verify the `AC-9` test (empty order → every field 0, including `shippingKopecks`) passes

## 3. Coupon classification

- [ ] 3.1 De-duplicate `order.coupons` by exact string value keeping first occurrence; verify the `AC-12` test (`["SAVE10","SAVE10"]` → 10 000, empty `rejectedCoupons`) passes
- [ ] 3.2 Add catalogue lookup with exact code matching, rejecting misses as `unknown`; verify the `AC-10` test passes
- [ ] 3.3 Add contract validation (non-finite or negative `value`, `percent` > 100, non-integer `fixed` value, `Number.isNaN(Date.parse(expiresAt))`) rejecting as `invalid`, placed **before** the expiry check; verify the `AC-17` and `AC-18` tests pass
- [ ] 3.4 Add the expiry check `now.getTime() >= Date.parse(expiresAt)` rejecting as `expired`; verify `AC-2`, `AC-11a` and `AC-11b` pass — 11a and 11b together are what distinguish `>=` from `>`
- [ ] 3.5 Add the `minSubtotalKopecks` check against the **raw** subtotal, inclusive, rejecting as `below-min-subtotal`; verify `AC-7` (exactly at threshold, gold → applies) and `AC-14` (one kopeck short → rejected) pass
- [ ] 3.6 Add the category check rejecting a category coupon with no matching line items as `no-matching-items`; verify `AC-13` passes

## 4. Candidate pricing and selection

- [ ] 4.1 Compute each candidate's base — `subtotal − tierDiscount` without a category, `categorySubtotal − floor(categorySubtotal × tierPercent ÷ 100)` with one — and its discount: `percent` → `floor(base × value ÷ 100)`, `fixed` → `min(value, base)`; verify `AC-5` (sequential, 13 500), `AC-6` (category base 38 000 → 7 600) and `AC-4` (fixed 200 000 capped at 10 000) pass
- [ ] 4.2 Select the candidate with the largest discount in kopecks, breaking ties by earliest position in the **typed** order, and mark every other candidate `not-best`; verify `AC-3`, `AC-16` (tie → `TIE_B`, the earlier typed) and `AC-19` (kopecks beat nominal percent) pass
- [ ] 4.3 Emit `rejectedCoupons` by re-walking the deduplicated typed codes and taking each assigned reason, so ordering is typing order rather than reason-assignment order; verify `AC-3` and `AC-16` still show the expected single-element arrays and `AC-15(а)` holds

## 5. Assembly and invariants

- [ ] 5.1 Floor the goods amount at zero before adding undiscounted shipping, with a comment noting the guard is unreachable for in-contract data (D-7); verify `AC-4` gives `totalKopecks = 4_900`, never negative
- [ ] 5.2 Verify the `AC-8` rounding test (33 333 at 15% → 4 999, total 33 234) passes and every breakdown field satisfies `Number.isInteger`
- [ ] 5.3 Add the `AC-15` invariant test: a seeded pseudo-random order/coupon generator run a few thousand times in a plain loop asserting completeness (а), non-negativity (б), reconciliation (в) and integrality (г); verify it passes with no new dev dependency

## 6. Wiring and verification

- [ ] 6.1 Re-export `priceOrder` and the result types from `app/src/index.ts`, leaving the existing exports untouched; verify `npm run typecheck` passes
- [ ] 6.2 Verify `cd app && npm test` is fully green and the output lists one test per acceptance criterion named by its id (AC-1…AC-19, with AC-11 split into 11a/11b — 20 cases) alongside the 8 pre-existing pricing tests
- [ ] 6.3 Verify `app/src/pricing.ts` and `app/src/types.ts` are unchanged (`git diff --stat` shows neither file) — the seeded contract is a guardrail
- [ ] 6.4 Record every AC id in `docs/traceability.md` (repo root, outside `app/`) pointing at the implementing code line and the test line, and fill in the reverse check for behaviour not asked for by the spec
