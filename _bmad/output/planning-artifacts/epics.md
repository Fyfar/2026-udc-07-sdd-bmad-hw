---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - "_bmad/output/planning-artifacts/prds/prd-2026-udc-07-sdd-bmad-hw-2026-08-30/prd.md"
  - "_bmad/output/planning-artifacts/prds/prd-2026-udc-07-sdd-bmad-hw-2026-08-30/addendum.md"
---

# Checkout Discounts (Loyalty Tiers + Promo Codes) - Epic Breakdown

## Overview

This document decomposes the PRD
(`_bmad/output/planning-artifacts/prds/prd-2026-udc-07-sdd-bmad-hw-2026-08-30/prd.md`)
into implementable epics and stories for the checkout engineering team
building the discount engine in `app/`.

**No Architecture.md or UX design contract exists for this project** — the
architect and UX-designer roles have not been invoked in this BMAD chain
(this run covers Analyst → PM only, per the task that produced this
document). `[ASSUMPTION]`: proceeding with PRD as the sole planning input,
consistent with `app/AGENTS.md`'s framing of this as "a pure domain
library" with no starter template, infra, or UI surface to decompose —
there is nothing an Architecture or UX document would have added that the
PRD's §4.3 (stacking algorithm) and Glossary don't already pin down for a
backend-only feature. Flagged here rather than silently skipped.

## Requirements Inventory

### Functional Requirements

FR1: The engine applies `tierPercent(order)` to the order's items
subtotal for every order, including 0% (no special-cased "none" branch).
`shippingKopecks` is untouched. (PRD FR-1)

FR2: Each string in `order.coupons` is resolved (trimmed, case-insensitive)
against a `coupons: Coupon[]` catalog and validated independently. A code
not matching any `Coupon.code` is rejected `not_found`. A code past its
`expiresAt` (exclusive) as of the supplied `asOf` is rejected `expired`. A
code whose `minSubtotalKopecks` exceeds the order's gross item subtotal
(pre-any-discount) is rejected `min_not_met`. A code scoped to a category
with zero items in the order is rejected `no_matching_items`. The second
and later entry of the same code (post trim/case-fold) is rejected
`duplicate`. Validation order per code: `not_found` → `expired` →
`min_not_met` → `no_matching_items` → `category_claimed` → `duplicate`,
first failing check wins. (PRD FR-2)

FR2a: At most 10 distinct codes are processed per order; the 11th and
later entered codes are rejected `too_many_codes` without further
validation. (PRD FR-2a)

FR3: The engine partitions the items subtotal into one running bucket per
distinct `LineItem["category"]` present in the order. The tier discount
and any non-category-scoped coupon reduce every bucket (percent: same %
per bucket; fixed: split proportional to each bucket's current share,
round half-up per bucket, leftover kopeck to the largest-remaining bucket,
ties broken by category name ascending). A category-scoped coupon reduces
only its own bucket. Every reduction floors its bucket at 0 and rounds
half-up to the nearest kopeck at computation time. The discounted items
total is the sum of all buckets after all steps; `shippingKopecks(order)`
is added after, unmodified. (PRD FR-3)

FR4: If two different, otherwise-valid codes are scoped to the same
category, the first in customer entry order is applied and the second is
rejected `category_claimed`. (PRD FR-4)

FR5: The engine's entry point takes an explicit `asOf: Date` parameter for
expiry comparisons rather than reading `Date.now()` internally; `asOf`
defaults to `new Date()` only at the outer call site. (PRD FR-5)

FR6: The engine returns, per order: the discounted items total, the
unchanged shipping fee, the grand total, and one outcome entry per
*entered* code (including rejected duplicates and over-cap codes) —
`{ code, applied: boolean, discountKopecks?: number, reason?: RejectionReason }`
where `RejectionReason` is one of `not_found`, `expired`, `min_not_met`,
`category_claimed`, `no_matching_items`, `duplicate`, `too_many_codes`.
Grand total is never negative. (PRD FR-6)

### NonFunctional Requirements

NFR1: All money arithmetic in the discount path uses integer kopecks
only — no floating-point representation of money at any computation step
(`app/AGENTS.md` convention; PRD §4.3, "Kopeck" glossary entry).

NFR2: The discount engine's public entry point is a pure function — no
hidden I/O, no implicit `Date.now()` read, no mutation of its `order` or
`coupons` inputs — so results are deterministic and reproducible across
test runs. (PRD FR-5, addendum §C)

NFR3: The existing signatures of `lineTotalKopecks`, `subtotalKopecks`,
`shippingKopecks`, `tierPercent`, and the shapes in `app/src/types.ts` are
not changed — the new engine is additive-only. (PRD §5 Non-Goals,
`app/AGENTS.md` guardrail)

NFR4: Every automated test is named after the acceptance criterion it
covers, per `app/AGENTS.md` convention, so the spec link is visible in
test output. (PRD §6.1, `app/AGENTS.md`)

### Additional Requirements

- No Architecture document exists to extract from; no starter-template,
  infra, deployment, or external-integration requirements apply — `app/`
  is a dependency-free TypeScript domain library (`app/AGENTS.md`: "No
  runtime dependencies").
- Existing project tooling (`npm test` via vitest, `npm run typecheck` via
  tsc) is the delivery gate — carried forward from `app/AGENTS.md`, not
  from an Architecture doc.

### UX Design Requirements

- No UX design contract exists. PRD §8 Open Question #2 explicitly defers
  checkout/receipt itemization UI to a future UX spec; this epic breakdown
  covers only the pricing-engine surface (FR6's structured result is the
  hand-off point for that future UI work).

### FR Coverage Map

| Requirement | Epic.Story |
|---|---|
| FR1 | 1.1 |
| FR5 | 1.2 |
| FR2 | 2.1, 2.2, 2.3 |
| FR2a | 2.4 |
| FR3 | 1.1, 3.1, 3.2 |
| FR4 | 3.3 |
| FR6 | 4.1 |
| NFR1 | 1.1, 3.1 (enforced throughout, verified via typecheck + money-exactness tests) |
| NFR2 | 1.2 |
| NFR3 | 4.2 |
| NFR4 | all stories (each AC set names its covering test) |

## Epic List

1. **Epic 1: Tier Discount Foundation** — Apply the existing `tierPercent`
   at checkout, initialize the per-category bucket model every later
   discount step reads and writes, and establish the engine's
   deterministic time/API shape.
2. **Epic 2: Promo Code Validation** — Resolve, validate, and report
   outcomes for every customer-typed code against the coupon catalog,
   independent of discount math.
3. **Epic 3: Discount Stacking Engine** — Combine tier and coupon
   discounts on one order via the per-category-bucket model, with
   category-conflict precedence and exact rounding/flooring.
4. **Epic 4: Result Reporting & Contract Safety** — Assemble the final
   per-order result (totals + per-code outcomes) and verify the existing
   `pricing.ts` contract is untouched.

## Epic 1: Tier Discount Foundation

Consume the already-specified `tierPercent()` at checkout, and give the
engine a deterministic clock — the two smallest, independent pieces every
later epic depends on.

### Story 1.1: Initialize per-category buckets and apply the tier discount

As a checkout customer with an earned loyalty tier,
I want my Silver or Gold discount applied to my items subtotal automatically,
So that I actually receive the benefit the tier promises instead of it being computed and discarded.

This story also establishes the per-category bucket model (PRD FR3) that
every later coupon-application story (Epic 3) reads and writes — the tier
discount is the first step to run against it, so it's the natural place
to introduce it rather than retrofitting buckets in after the fact.

**Acceptance Criteria:**

**Given** an order with `customerTier: "gold"` and an items subtotal of 100 000 kopecks, all one category
**When** the discount engine computes the discounted items total with no coupons entered
**Then** the result is 90 000 kopecks (10% off)
**And** `shippingKopecks(order)` is unchanged by this computation

**Given** an order with `customerTier: "none"`
**When** the discount engine computes the discounted items total
**Then** the result equals the items subtotal unchanged (0% is applied, not skipped — the same code path runs)

**Given** an order with 600 kopecks of `fresh` items and 400 kopecks of `standard` items, `customerTier: "gold"`
**When** the engine initializes per-category buckets and applies the tier discount
**Then** exactly one bucket per distinct category present exists, each initialized to that category's gross line-item total, and the tier step reduces the `fresh` bucket to 540 kopecks and the `standard` bucket to 360 kopecks (10% off each, independently rounded half-up at this step)

**Given** an order with items in only one category
**When** buckets are initialized
**Then** exactly one bucket exists

### Story 1.2: Deterministic reference time for expiry checks

As a checkout engineer writing tests against this engine,
I want the engine to take an explicit `asOf` parameter instead of reading the system clock,
So that expiry-dependent tests are deterministic and never flaky.

**Acceptance Criteria:**

**Given** two calls to the engine with identical `order` and `coupons` but `asOf` values on either side of a coupon's `expiresAt`
**When** each call runs
**Then** the two calls produce different outcomes for that code, with no dependency on the actual wall clock at test-run time

**Given** the engine's public entry point signature
**When** it is called without an explicit `asOf`
**Then** the default (`new Date()`) is applied only at the outer call site (e.g. `index.ts`), never inside the pure pricing function itself

**Given** the engine is called twice with the same `order`, `coupons`, and `asOf`
**When** results are compared
**Then** they are byte-for-byte identical (pure function, no hidden state)

## Epic 2: Promo Code Validation

Every string the customer typed gets resolved against the coupon catalog
and gets exactly one explicit outcome, before any discount arithmetic
runs.

### Story 2.1: Resolve typed codes against the coupon catalog

As a checkout customer,
I want my typed promo code recognized even if I typed it in a different case or with extra spaces,
So that a harmless typo in casing or whitespace doesn't cost me a discount I'm entitled to.

**Acceptance Criteria:**

**Given** a `Coupon` catalog containing code `"AUTUMN10"` and an order with `coupons: [" autumn10 "]`
**When** the engine resolves codes
**Then** the code matches (trimmed, case-insensitive) and proceeds to further validation

**Given** an order with a typed code that matches no `Coupon.code` in the catalog, case-insensitively
**When** the engine resolves codes
**Then** that code's outcome is `applied: false, reason: "not_found"`

### Story 2.2: Reject expired and under-minimum codes with explicit reasons

As a checkout customer whose promo code didn't work,
I want to know exactly why (expired, or my order isn't big enough yet),
So that I'm not left guessing why the price didn't move.

**Acceptance Criteria:**

**Given** a coupon with `expiresAt` on or before the supplied `asOf`
**When** the customer's order includes that code
**Then** the outcome is `applied: false, reason: "expired"` (expiresAt is exclusive: "not valid on or after this instant")

**Given** a coupon with `minSubtotalKopecks` greater than the order's gross item subtotal
**When** the customer's order includes that code
**Then** the outcome is `applied: false, reason: "min_not_met"`, checked against the gross subtotal (pre-tier, pre-any-coupon) per PRD FR2 / brief decision #4

**Given** a coupon scoped to `category: "digital"` and an order containing no `digital` line items
**When** the customer's order includes that code
**Then** the outcome is `applied: false, reason: "no_matching_items"` (distinct from `not_found` — the code exists — and from `category_claimed` — no competing code claimed it)

### Story 2.3: Reject duplicate code entries explicitly

As a checkout customer who accidentally typed the same code twice,
I want the system to tell me plainly rather than silently double-count or silently drop it,
So that I understand exactly what happened to each code I entered.

**Acceptance Criteria:**

**Given** an order with `coupons: ["AUTUMN10", "autumn10"]` (same code, different case) where `AUTUMN10` is otherwise valid
**When** the engine resolves codes
**Then** the first entry's outcome is `applied: true` and the second entry's outcome is `applied: false, reason: "duplicate"`
**And** the discount is applied exactly once, not twice

**Given** the validation-order precedence in PRD FR2
**When** a duplicate code would also fail another check (e.g. it's expired)
**Then** `duplicate` is only reported for a code whose first occurrence already passed or is being independently evaluated on its own merits — the fixed order (`not_found` → `expired` → `min_not_met` → `no_matching_items` → `category_claimed` → `duplicate`) determines which single reason is reported for each occurrence

### Story 2.4: Cap codes per order

As a checkout system operator,
I want a hard ceiling on how many promo codes one order can carry,
So that an unbounded client-supplied array can't be used to abuse checkout or degrade performance.

**Acceptance Criteria:**

**Given** an order with 11 distinct typed codes
**When** the engine resolves codes
**Then** the first 10 (in entry order) are validated normally and the 11th is rejected `applied: false, reason: "too_many_codes"` without catalog/expiry/minimum checks being run against it

**Given** an order with exactly 10 distinct typed codes, all otherwise valid
**When** the engine resolves codes
**Then** all 10 are validated normally (the cap is inclusive of 10)

## Epic 3: Discount Stacking Engine

The core of the ambiguity this PRD closes: how the tier discount and every
validated coupon combine into one exact-kopeck total, category-scoped or
not.

### Story 3.1: Apply category-scoped coupons to their own bucket

As Growth running a category-limited campaign,
I want a category-restricted coupon's percentage to come off only that category's subtotal,
So that a "fresh produce" discount doesn't quietly discount the whole order.

**Acceptance Criteria:**

**Given** the post-tier state from Story 1.1 (`fresh`: 540, `standard`: 360) and a coupon `FRESH20` (`category: "fresh"`, 20%, no minimum)
**When** `FRESH20` is applied
**Then** the `fresh` bucket becomes 432 kopecks (20% off 540, exact) and the `standard` bucket is unchanged at 360

**Given** a category bucket reduced by a category-scoped coupon to below 0 (e.g. a large fixed-value category coupon)
**When** the reduction is applied
**Then** that bucket floors at 0, and no other bucket is affected

**Given** the discounted items total after all steps
**When** it is computed
**Then** it equals the sum of all category buckets, and `shippingKopecks(order)` is added on top, unmodified

### Story 3.2: Apply non-category coupons proportionally across buckets

As a checkout engineer,
I want a whole-order (non-category) coupon to reduce every category bucket consistently,
So that a category-scoped coupon applied afterward still sees a correct, compounded remaining amount for its category.

**Acceptance Criteria:**

**Given** the post-tier state from Story 1.1 (`fresh`: 540, `standard`: 360) and a non-category percent coupon `SAVE10` (10%, no category)
**When** `SAVE10` is applied
**Then** the `fresh` bucket becomes 486 and the `standard` bucket becomes 324 (10% off each bucket — exact, since percent-of-whole distributes evenly)

**Given** the post-tier state from Story 1.1 (`fresh`: 540, `standard`: 360, whole-order remaining 900) and a non-category fixed coupon `SAVE50` (5 000 kopecks off, no category)
**When** `SAVE50` is applied
**Then** the 5 000 kopecks is split proportional to each bucket's current share (540:360 = 3:2 → fresh 3 000, standard 2 000), each rounded half-up, with any single leftover/shortfall kopeck from that rounding assigned to the bucket with the largest current remaining value (ties broken by category name ascending: `digital` < `fresh` < `standard`)
**And** the resulting buckets are `fresh`: 0 (540 − 3 000, floored) and `standard`: 0 (360 − 2 000, floored)

**Given** a non-category fixed coupon applied to an order with three category buckets whose proportional split produces a rounding remainder
**When** the split is computed
**Then** the remainder-assignment rule (largest current bucket, ties broken alphabetically by category name) is applied deterministically — repeated runs on the same order produce an identical split every time

### Story 3.3: Reject the second code claiming an already-discounted category

As Growth running two category campaigns that happen to overlap on one category,
I want only the first-entered code for a category to apply, and the second to be explicitly rejected — not summed, not silently dropped,
So that a customer can't stack two category-restricted discounts into an unbounded combined discount that wasn't approved.

**Acceptance Criteria:**

**Given** an order with `coupons: ["FRESH20", "FRESHFEST"]`, both scoped to `category: "fresh"` and both otherwise individually valid
**When** the engine processes codes in entry order
**Then** `FRESH20`'s outcome is `applied: true` and `FRESHFEST`'s outcome is `applied: false, reason: "category_claimed"`

**Given** the same scenario with the entry order reversed (`["FRESHFEST", "FRESH20"]`)
**When** the engine processes codes
**Then** `FRESHFEST` is applied and `FRESH20` is rejected `category_claimed` — precedence follows entry order, not coupon value or any other tie-break

**Given** two codes scoped to *different* categories in the same order (e.g. `FRESH20` on `fresh`, `STD15` on `standard`), both otherwise valid
**When** the engine processes codes
**Then** both are applied — `category_claimed` only fires for a genuine same-category conflict

## Epic 4: Result Reporting & Contract Safety

Assemble the customer-facing result and hold the line on the existing
`pricing.ts` contract.

### Story 4.1: Return per-order totals and per-code outcomes

As a checkout customer,
I want the system to tell me my final total and exactly what happened to every code I entered,
So that I never see a price that "just didn't move" with no explanation.

**Acceptance Criteria:**

**Given** an order with a Gold tier, one applied non-category coupon, and one expired coupon
**When** the engine computes the result
**Then** the response includes the discounted items total, the unchanged `shippingKopecks`, a grand total equal to their sum, and exactly two outcome entries — one `applied: true` with its `discountKopecks`, one `applied: false, reason: "expired"`

**Given** any order, regardless of how many discounts apply
**When** the grand total is computed
**Then** it is never negative — the items total floors at 0 before shipping is added, and shipping itself is never reduced below its flat fee

**Given** an order with zero coupons entered and `customerTier: "none"`
**When** the engine computes the result
**Then** the outcome list is empty, the discounted items total equals the gross items subtotal, and the grand total equals subtotal + shipping (identical to today's un-discounted behavior)

### Story 4.2: Verify the existing pricing.ts contract is untouched

As the checkout engineering team maintaining `app/`,
I want automated proof that this feature never altered the signatures or behavior of the existing pricing functions,
So that other code depending on `lineTotalKopecks`, `subtotalKopecks`, `shippingKopecks`, and `tierPercent` is never silently broken by this change.

**Acceptance Criteria:**

**Given** the completed discount engine implementation
**When** `npm run typecheck` is run
**Then** it passes with zero changes required to `app/src/types.ts` or to the signatures of `lineTotalKopecks`, `subtotalKopecks`, `shippingKopecks`, or `tierPercent`

**Given** the existing (pre-feature) behavior of `lineTotalKopecks`, `subtotalKopecks`, and `shippingKopecks`
**When** the new discount engine's tests run alongside them
**Then** all pre-existing tests for those three functions still pass unmodified, demonstrating additive-only integration

**Given** the full test suite for this feature
**When** `npm test` is run
**Then** every test name references the acceptance criterion it covers (per `app/AGENTS.md` convention), and all tests pass
