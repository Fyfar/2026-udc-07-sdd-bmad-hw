---
title: Checkout Discounts — Loyalty Tiers + Stacking Promo Codes
status: draft
created: 2026-08-30
updated: 2026-08-30
---

# Product Brief: Checkout Discounts (Loyalty Tiers + Promo Codes)

## Executive Summary

Growth wants the autumn campaign to launch with two discount mechanisms live at
checkout: the loyalty tiers that already exist in code but are never applied
(`tierPercent` — Silver 5%, Gold 10%), and promo codes (percent-off or
fixed-hryvnia-off, optionally restricted to a category or gated behind a
minimum order size). The request also asks that a promo code and a loyalty
discount both apply on the same order, that customers can enter more than one
code, that expired codes are rejected, and that the money comes out exactly to
the kopeck.

The originating request (`materials/feature-request.md`) is a real-world,
business-authored ticket: correct in intent, silent on mechanics. It does not
say whether discounts add or compound, what a discount is computed against,
what happens when two codes compete for the same items, or how rounding
works. Two engineers implementing it as written would ship two different,
equally defensible systems. This brief exists to close every one of those
forks with a stated, testable decision, so the discount engine that gets
built next (`app/`) has exactly one correct behavior to implement against.

## The Problem

Checkout currently computes subtotal, shipping, and a `tierPercent` value
that nothing consumes (`app/src/pricing.ts`). Customers earn a loyalty tier
that gives them nothing, and there is no coupon mechanism at all. The autumn
campaign is the business trigger, but the underlying gap — a pricing engine
that stops short of applying its own discount inputs — exists independent of
any single campaign, and will recur every time Growth wants a promo push.

The risk of building it now, from the ticket alone, is not "nothing ships in
two weeks" — it's that something ships that looks correct, passes a demo, and
is wrong on real orders: stacking math that quietly favors or disadvantages
the customer versus what Growth intended, coupons that double up on the same
category, or kopecks that go missing across thousands of orders because
nobody wrote down a rounding rule. `app/AGENTS.md` already flags this
directly: rounding, stacking order, and coupon precedence are specification
decisions, and if the spec doesn't state one, the spec — not the code — is
incomplete.

## The Solution

A discount engine, built alongside the existing `app/src/pricing.ts`
functions (not replacing them), that:

- Applies the customer's `tierPercent` to the items subtotal.
- Validates each promo code the customer entered (existence, expiry,
  category match, minimum-subtotal gate) and applies every code that
  passes, not just one.
- Combines the tier discount and coupon discount(s) on one order, using a
  fixed, documented stacking order (see Key Decisions) rather than leaving
  "applies together" to interpretation.
- Rounds and floors money in one place, in whole kopecks, so the total is
  reproducible to the last kopeck across every order shape.
- Reports which of the customer's codes applied and, if any were rejected,
  why — instead of a silent no-op that leaves the customer guessing why the
  price didn't move.

## Key Decisions (ambiguities the ticket left open, resolved here)

The ticket poses several forks explicitly and implies several more. Each is
resolved below as a testable rule. These are business/product decisions, not
implementation details — `app/AGENTS.md` requires exactly this before code is
written.

| # | Fork | Decision |
|---|------|----------|
| 1 | Tier % + coupon % — additive or sequential? | **Sequential.** Tier discount applies first to the items subtotal; each coupon then applies to the *remaining* amount, in the order the customer typed the codes. Compounding (not adding) protects margin and matches checkout UX — loyalty is known before checkout starts, promo codes are the last thing entered. |
| 2 | Discount base — items only, or items + shipping? | **Items subtotal only.** Shipping (`shippingKopecks`) is never discounted; it's charged on top of the discounted item total, unchanged from its existing flat-fee behavior. |
| 3 | Category-scoped coupon — % of that category, or % of the whole order? | **% of the matching-category subtotal only.** |
| 4 | Minimum-subtotal gate — checked before or after other discounts? | **Before.** `minSubtotalKopecks` is checked against the order's gross item subtotal, so applying the tier discount first can never help a coupon sneak past its own minimum. |
| 5 | Multiple promo codes — apply all, best-only, or first-only? | **All that individually validate**, applied together, not just the best one — this is what "customer can enter several codes" means to Growth. Codes are matched case-insensitively, trimmed, and de-duplicated (typing the same code twice applies it once). |
| 6 | Two valid codes target the same category — both apply? | **No — first one wins.** By entry order, the first valid code for a category is applied; any later code for the same category is rejected with an explicit reason, not silently dropped or combined. |
| 7 | Expired code — silent no-op or explicit error? | **Explicit.** The pricing result reports each code's outcome (applied, or rejected + reason) so checkout can tell the customer their code didn't work and why. |
| 8 | Rounding — per line or on the total? Which direction? | **Per line, round-half-up, to the nearest whole kopeck**, at the point each discount is computed — never carried forward as a fraction. All money stays integer kopecks end to end, consistent with `types.ts`. |
| 9 | Can the total go negative? Is there a floor? | **No.** The discounted item subtotal floors at 0 kopecks. Shipping, when owed, is added after the floor and is itself never discounted below its flat fee. |

Full rationale, and the alternatives considered and rejected for each
decision, are in `addendum.md`.

## Who This Serves

- **Checkout customers** with an earned loyalty tier and/or a campaign promo
  code, who expect the discount they were promised — both of them, together
  — to show up correctly, with no surprise negative totals and no silent
  failures on an expired code.
- **Growth / marketing**, who need promo codes (category-limited,
  minimum-order-gated, stackable with loyalty) as a working lever for the
  autumn campaign and every campaign after it.
- **The checkout engineering team**, who need one unambiguous spec to build
  against instead of re-deriving these rules from a two-paragraph email —
  this brief is written for them as much as for Growth.

## Success Criteria

- `tierPercent` is applied at checkout for every Silver/Gold order — no
  longer computed and discarded.
- A promo code (percent or fixed, category-scoped or not, minimum-gated or
  not) applies correctly per the rules in Key Decisions, verified by
  automated tests named after the acceptance criterion they cover (per
  `app/AGENTS.md` convention).
- A loyalty tier and one or more promo codes combine on the same order per
  decision #1 — verifiably, via a test asserting the exact expected total,
  not just "some discount was applied."
- An expired code never reduces the total, and the checkout response says
  so explicitly.
- Across a spot-check batch of representative orders (single-item,
  multi-item, mixed-category, international-shipping, all-digital), the computed
  total reconciles to the kopeck with a manual calculation — no float drift.
- Ships within the two-week window Growth asked for.

## Scope

**In (v1, this campaign):**
- Apply existing `tierPercent` at checkout.
- Percent and fixed-value promo codes, with optional category restriction
  and optional minimum-subtotal gate.
- Multiple codes per order, combined with the loyalty discount, per the
  Key Decisions stacking rule.
- Expiry enforcement with an explicit rejection reason.
- Exact-kopeck rounding and a non-negative floor.

**Out (explicitly not this round):**
- Changing `Order`, `LineItem`, `Coupon` shapes, or the signatures of
  `lineTotalKopecks`, `subtotalKopecks`, `shippingKopecks`, `tierPercent`
  (guardrail from `app/AGENTS.md` — these are a stable contract), or
  `unitPriceKopecks` (no schema change needed for that either).
- Coupon issuance/management tooling (creating, disabling, or bulk-loading
  `Coupon` records) — this brief assumes coupons already exist as data;
  where they come from is a separate concern.
- Any cap on the number of promo codes a customer may enter (left open
  below).
- Per-code or per-tier itemization on the receipt/checkout UI — a UX
  decision, not part of this pricing-engine brief.

## Open Questions (left unresolved — for PM/architecture, not decided here)

- **Max codes per order.** Nothing in the ticket or in Success Criteria
  caps how many promo codes one order can carry. Left open as a
  product/abuse-risk question rather than defaulted, since a wrong default
  here (e.g., "no limit") has real cost if picked wrong and isn't implied
  by anything in the ticket.
- **Receipt/UI itemization.** Whether the loyalty discount and each applied
  coupon are shown as separate line items to the customer, or only the
  final total, is a UX call outside a pricing-engine brief.

## Vision

Past this campaign, this is the shape every future promo push reuses: new
`Coupon` records, no new code. The stacking, rounding, and rejection rules
decided here become the one place discount behavior is defined, so the next
"can we run a Black Friday coupon" request is a data change, not a re-litigation
of how discounts combine.
