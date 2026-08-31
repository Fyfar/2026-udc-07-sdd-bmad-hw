---
title: Addendum — Checkout Discounts brief
related: brief.md
---

# Addendum: Options Considered and Rejected

Detail behind the Key Decisions table in `brief.md`. Kept out of the brief
to stay within its 1-2 page target; this is where a reviewer (or the next
BMAD role) checks the reasoning, not just the conclusion.

## 1. Stacking order: sequential vs. additive

- **Chosen: sequential/compounding.** Tier discount off the subtotal first,
  then each coupon off the remaining amount, in entry order.
- **Rejected: additive (10% + 15% = 25% off the original subtotal).** The
  ticket's own worked example (1 000 грн order, 15 грн difference) shows the
  business is aware additive is more generous to the customer. Nothing in
  the ticket asks for the more generous interpretation, and "customer should
  feel the benefit of both" is satisfied by either — sequential still gives
  a real, visible combined discount, just a smaller one. Sequential was
  chosen because it fails safe on margin: a wrong guess that's too generous
  costs money on every discounted order for the life of the campaign;
  a wrong guess that's too conservative is an easy, low-risk change to loosen
  later. Flag this explicitly to Growth in review — if their intent was
  additive, that's a one-line rule change, not a redesign.

## 2. Discount base: items subtotal vs. items + shipping

- **Chosen: items subtotal only.**
- **Rejected: discount includes shipping.** The ticket only ever talks about
  "знижки" in the context of items/categories/order amount; shipping is
  handled by a separate, already-fully-specified function
  (`shippingKopecks`) that `app/AGENTS.md` calls out as deliberately not
  part of the ambiguous surface. Discounting it would mean modifying settled
  behavior with zero textual basis.

## 3. Category coupon base: category subtotal vs. whole-order subtotal

- **Chosen: category subtotal.**
- **Rejected: whole-order base.** A category-restricted coupon whose percent
  is taken off the *whole* order effectively becomes a general discount with
  extra steps, which defeats the stated purpose of restricting it to a
  category in the first place ("деякі діють лише на певну категорію
  товарів"). Category subtotal is the only reading consistent with the word
  "restricted."

## 4. Minimum-subtotal gate: before vs. after other discounts

- **Chosen: before — checked against gross item subtotal.**
- **Rejected: checked after tier/other-coupon discounts are applied.**
  Checking post-discount creates a feedback loop where whether a coupon
  qualifies depends on the order in which the tier discount and other
  coupons were applied — an order could bounce in and out of qualifying
  depending on stacking order, which is exactly the kind of "копійки
  пливуть" unpredictability item 6
  warns about, just at the eligibility layer instead of the rounding layer.
  Gross-subtotal gating is stable and independent of everything else.

## 5. Multiple codes: apply all vs. best-only vs. first-only

- **Chosen: apply all that validate.**
- **Rejected: best-of (pick the single most valuable code).** This directly
  contradicts the ticket's own framing — "клієнт може ввести кілька
  промокодів" (customer *can* enter several) reads as a capability to use
  several, not a capability to try several and have the system silently
  pick one. Best-of would make entering more than one code pointless from
  the customer's perspective.
- **Rejected: first-only (apply only the first code typed).** Same
  objection — makes the plural "codes" meaningless.

## 6. Same-category conflict between two valid codes

- **Chosen: first-by-entry-order wins, later one explicitly rejected.**
- **Rejected: sum both category discounts.** Two category coupons stacking
  on the same items is a much larger, uncapped discount that nothing in the
  ticket asks for or bounds — it's the "two promo codes on one category"
  scenario the ticket itself flags as unresolved, phrased as a question, not
  a request for double-stacking. First-wins is the smallest, safest reading,
  and — combined with decision #7's explicit-rejection principle — the
  customer still finds out the second code didn't do anything, rather than
  it silently vanishing.

## 7. Expired/invalid code: silent vs. explicit

- **Chosen: explicit, per-code outcome in the pricing result.**
- **Rejected: silent no-op (order prices as if the code was never entered).**
  From the customer's seat, silent failure is indistinguishable from a bug —
  they'll retype the code, contact support, or assume the site is broken.
  Given this is a customer-facing campaign mechanism, an explicit reason
  ("expired", "category mismatch", "minimum not met", "category already
  discounted by another code") is low-cost to plumb through now and
  expensive to retrofit once checkout UI has shipped against a silent
  contract.

## 8. Rounding: per-line vs. on-the-total, and direction

- **Chosen: per-line, round-half-up, nearest whole kopeck, at computation
  time.**
- **Rejected: round only the final total.** Per-AGENTS.md, amounts are
  integer kopecks throughout, so there's no fractional kopeck to carry from
  one line to the next — rounding at the end instead of per-line only
  matters if intermediate math is allowed to carry fractions, which the
  existing codebase's integer-kopecks convention already forecloses.
- **Rejected: round down (floor) or to-nearest-even (banker's).** Round-
  half-up is the simplest rule a support agent or Growth stakeholder can
  verify by hand against a receipt — "half a kopeck rounds up" needs no
  further explanation, unlike banker's rounding. Floor was rejected because
  it systematically under-delivers the discount, which reads as the company
  shortchanging the customer on a marketing promise.

## 9. Floor / can total go negative

- **Chosen: item subtotal floors at 0; shipping is unaffected and still
  charged.**
- **Rejected: allow negative (the store owes the customer money).** Not
  supportable by any real checkout — nothing in the ticket implies a
  payout mechanism. Floor at 0 is the only defensible reading.
- **Rejected: floor the *grand* total (including shipping) at 0**, i.e. let
  a large discount also eat into shipping. Rejected for the same reason as
  decision #2 — shipping isn't part of the discountable surface at all, so
  it can't be reduced by a floor computed on the discount side either.

## Sizing / stakes note

This is an internal engineering change to an existing checkout, requested by
a named internal stakeholder (Head of Growth) with a two-week deadline, not
a new product needing market sizing or competitive research — so this brief
skips a discovery research pass (per `bmad-product-brief` ## Discovery,
scaled down: "right-size to purpose"). The work that matters is disambiguating
the ticket, not validating market fit.
