---
title: Checkout Discounts — Loyalty Tiers + Stacking Promo Codes
created: 2026-08-30
updated: 2026-08-30
status: final
---

# PRD: Checkout Discounts (Loyalty Tiers + Promo Codes)

## 0. Document Purpose

This PRD is for the checkout engineering team building the discount engine
in `app/`, and for the architect and stories workflow that follow it. It
turns Mary's product brief
(`_bmad/output/planning-artifacts/briefs/brief-2026-udc-07-sdd-bmad-hw-2026-08-30/`)
into implementable, testable functional requirements. The brief's nine Key
Decisions are inherited as-is (§4 cites them by number) and are not
re-litigated here. This PRD's job is the layer the brief explicitly didn't
cover: how those decisions interact with each other and with the actual
shapes in `app/src/types.ts` — the places where two brief decisions,
followed independently, don't compose into one unambiguous algorithm. Every
place that happened is called out inline as `[ASSUMPTION]` and indexed in
§9. This document was produced autonomously (no stakeholder available to
ask); every judgment call is logged in `.memlog.md` in this folder.

Vocabulary: this PRD uses "tier discount" and "coupon discount" as defined
in the Glossary (§3) throughout — never "loyalty discount" or "promo
discount" as synonyms.

## 1. Vision

Checkout currently computes a `tierPercent` that nothing applies, and has no
coupon mechanism. This PRD specifies a discount engine — new code alongside
`app/src/pricing.ts`, not a replacement for it — that turns a customer's
earned loyalty tier and typed promo codes into one correct, reproducible
order total, and tells the customer plainly which codes worked and which
didn't. It exists so that "run a promo campaign" becomes a data change
(new `Coupon` records) forever after, instead of a re-negotiation of
rounding and stacking rules every time.

## 2. Target User

### 2.1 Jobs To Be Done

- **Checkout customer:** "When I have a loyalty tier and/or a promo code, I
  want the discount I was promised to show up on my total — and if my code
  didn't work, I want to know why, not just see a number that didn't move."
- **Growth/marketing:** "I want to launch a promo code as a data record —
  percent or fixed, category-limited or not, minimum-order-gated or not —
  and trust that it stacks with loyalty tiers exactly the way we agreed,
  every time, without re-briefing engineering per campaign."
- **Checkout engineer (you, reading this PRD):** "I want one document that
  resolves every stacking/rounding/precedence fork so I'm not the one
  guessing — and so my tests assert an exact expected total, not just 'a
  discount happened.'"

### 2.2 Key User Journeys

Lighter scope dial — this is a backend pricing engine, not a new UI; the
checkout front end already exists and is out of scope. One journey
establishes the shape the FRs must serve:

- **UJ-1. A Gold customer stacks two promo codes at checkout.**
  Occurs entirely server-side inside the existing checkout flow; the
  customer sees a total and a per-code status list.
  - **Entry state:** Gold-tier customer, cart has `fresh` and `standard`
    items, has typed two promo codes into the checkout coupon field:
    `AUTUMN10` (10% off, no category restriction) and `FRESHFEST` (20% off
    `fresh` category only, min order 500 грн).
  - **Path:** Checkout submits the order (with both typed codes, in that
    order) to the discount engine. Engine applies the Gold 10% tier
    discount to the items subtotal, then `AUTUMN10` to the remaining
    amount, then `FRESHFEST` to the remaining `fresh`-category amount
    (realizes FR-1, FR-3, FR-4).
  - **Climax:** The response carries the final total and a per-code result:
    both codes `applied: true`. The customer sees both discounts land
    together, exactly matching what Growth advertised (realizes FR-6).
  - **Resolution:** Order proceeds to payment at the discounted, floored,
    kopeck-exact total; shipping is charged on top, undiscounted.
  - **Edge case:** if the customer had typed `FRESHFEST` twice, the second
    entry is reported `applied: false, reason: "duplicate"` — not silently
    merged, not double-applied (realizes FR-6).

## 3. Glossary

- **Kopeck** — the atomic integer unit all money is stored and computed in
  (100 kopecks = 1 hryvnia). No floats anywhere in the discount path.
- **Tier discount** — the percentage discount from `tierPercent()`
  (Silver 5%, Gold 10%) applied to the items subtotal. Always exactly one
  per order (possibly 0%), always applied first.
- **Coupon** — a `Coupon` record (`app/src/types.ts`) a customer's typed
  code may resolve to: `percent` or `fixed`, optionally `category`-scoped,
  optionally gated by `minSubtotalKopecks`, always time-boxed by
  `expiresAt`.
- **Category bucket** — this PRD's internal accounting unit: the running
  remaining-subtotal for one `LineItem["category"]` value
  (`standard` | `fresh` | `digital`) within one order, as it's reduced by
  successive discounts. Not a type in `types.ts` — an engine-internal
  concept introduced by this PRD to make "remaining amount" (brief
  decision #1) well-defined once category scoping (brief decision #3)
  enters the picture.
- **Applied discount** — a tier or coupon discount that reduced the order.
- **Rejected code** — a customer-typed code that did not reduce the order,
  paired with a `RejectionReason` (§4.2, FR-6).
- **Discount base** — the amount a given discount step's percent or fixed
  value is computed against: the whole-order remaining subtotal (tier, a
  non-category coupon) or one category bucket's remaining subtotal (a
  category-scoped coupon). Never includes `shippingKopecks`.

## 4. Features

### 4.1 Loyalty Tier Discount

**Description:** `tierPercent()` already exists and is fully specified
(0/5/10%); this feature is "consume it." The tier discount is always the
first discount applied, computed against the items subtotal (brief
decision #2), and reduces every category bucket by the tier percentage
(§4.3, FR-3) so downstream category-scoped coupons see an already-tier-
discounted base — consistent with brief decision #1's "sequential" framing
applied uniformly rather than as a special case for coupons only.

**Functional Requirements:**

#### FR-1: Apply the customer's tier percentage at checkout

The engine applies `tierPercent(order)` to the order's items subtotal for
every order, including `tierPercent === 0` (a no-op that still runs the
same code path — no special-cased "none" branch). Realizes UJ-1.

**Consequences (testable):**
- A Gold order with items subtotal 100 000 kopecks and no coupons has an
  items total of 90 000 kopecks after the tier discount.
- A `customerTier: "none"` order's items total is unchanged by this step
  (0% is applied, not skipped).
- `shippingKopecks` is untouched by this step (brief decision #2).

### 4.2 Promo Code Validation

**Description:** Each string in `order.coupons` is resolved against a
coupon catalog and validated independently before any discount math runs.
`Order.coupons: string[]` has no built-in way to resolve to `Coupon`
records — `types.ts` has no catalog/store type. `[ASSUMPTION]` (memlog):
the engine's public entry point takes the catalog as an explicit
parameter — `coupons: Coupon[]` — rather than an implicit lookup service,
keeping the function pure and matching `pricing.ts`'s existing
`(order) => value` style with one added input. Issuance/management of that
catalog is explicitly out of scope (brief).

**Functional Requirements:**

#### FR-2: Resolve and validate every typed code, independently

For each string in `order.coupons`, in entry order: trim whitespace,
match case-insensitively against `coupons[].code`. Every one gets exactly
one outcome — applied or rejected with a reason — realizing brief
decision #7 for *every* code, not just expired ones.

**Consequences (testable):**
- A typed code matching no `Coupon.code` (case-insensitively) is rejected
  with `reason: "not_found"`. `[ASSUMPTION]` (memlog) — the brief's four
  named reasons (expired, category mismatch, minimum not met, category
  already claimed) all presuppose the code resolved to a real coupon; a
  typo/nonexistent code is a fifth, necessary case the brief didn't
  enumerate.
- A code whose `expiresAt` is on or before `asOf` (§4.4, FR-5) is rejected
  with `reason: "expired"` (brief decision #7). `expiresAt` is exclusive
  per its doc comment ("not valid on or after this instant").
- A code with `Coupon.category` set, where the order has no items in that
  category at all, is rejected — see FR-4 for the exact reason
  (`no_matching_items`, distinct from a same-category conflict between two
  codes).
- A code with `minSubtotalKopecks` set, where the order's **gross** items
  subtotal (pre-tier, pre-any-coupon — brief decision #4) is below that
  threshold, is rejected with `reason: "min_not_met"`.
- The **second and later** occurrence of the same code (post trim/case-
  fold) is rejected with `reason: "duplicate"` — `[ASSUMPTION]` (memlog):
  the brief says a repeat "applies it once" but also demands an explicit
  outcome per decision #7; silently collapsing the repeat with no
  reported outcome would violate that. The first occurrence is validated
  normally against the other rules.
- Validation order is fixed: `not_found` → `expired` → `min_not_met` →
  `no_matching_items` → `category_claimed` (FR-4) → `duplicate`, first
  failing check wins. `[ASSUMPTION]` (memlog) — the brief doesn't state a
  precedence when a code fails more than one check simultaneously; this
  order was chosen so identity/validity failures (does this code exist,
  is it alive) are reported before order-shape-dependent failures (does
  this order qualify, does this category have items, does another code
  already own this category).

**Out of Scope:** Coupon record well-formedness (percent in 0-100, fixed
value non-negative) is assumed guaranteed upstream, per brief's exclusion
of coupon issuance tooling; this FR does not validate `Coupon` shape.

#### FR-2a: Cap codes per order

At most 10 distinct valid-looking codes are processed per order; the
11th and later entered codes are rejected with `reason: "too_many_codes"`
without being checked against catalog/expiry/etc. `[ASSUMPTION]` (memlog)
— the brief explicitly left "max codes per order" open as a PM decision
("a wrong default here has real cost if picked wrong and isn't implied by
anything in the ticket"); resolved here at 10 as an abuse/perf guard on an
unbounded client-supplied string array, with no market data behind the
specific number. Revisit if Growth's checkout UI wants a different cap —
logged as a residual open item (§8).

### 4.3 Discount Stacking Engine

**Description:** This is the feature that makes brief decisions #1 and #3
compose. The brief resolves "tier then coupons, sequentially, on the
remaining amount" (decision #1) and "category coupon computed off category
subtotal" (decision #3) independently, but never states how a whole-order
discount step (tier, or a coupon with no `category`) is supposed to affect
a *later* category-scoped coupon's base. Two engineers implementing
decisions #1 and #3 literally, without resolving this, would still ship
two different systems — e.g. one where category coupons always look at
the *original* category subtotal regardless of what already happened, and
one where they look at a whole-order-post-tier number with no per-category
meaning at all. Both are wrong readings of "sequential." This PRD resolves
it:

**Functional Requirements:**

#### FR-3: Track remaining subtotal per category bucket, not one order-wide number

The engine partitions the items subtotal into one bucket per distinct
`LineItem["category"]` present in the order, initialized to that
category's gross line-item total. Every discount step — the tier
discount, then each valid coupon in customer entry order — reduces one or
more buckets:
- **Tier discount** and a **non-category coupon** (no `Coupon.category`)
  reduce **every** bucket by the same percentage (percent coupon/tier: the
  math is exact — X% off each bucket equals X% off the sum). A
  **non-category fixed** coupon's flat kopeck amount is split across
  buckets proportional to each bucket's *current* share of the
  whole-order remaining total, rounded half-up per bucket (brief decision
  #8), with any single leftover/shortfall kopeck from that rounding
  assigned to the bucket with the largest current remaining value (ties
  broken by category name, ascending: `digital` < `fresh` < `standard`).
  `[ASSUMPTION]` (memlog) — this proportional-split-with-deterministic-
  remainder rule is new; the brief never poses or resolves this case.
- **Category coupon** (`Coupon.category` set) reduces only its own
  bucket, by its percent or fixed value, per brief decision #3.
- Every reduction floors its bucket at 0 (brief decision #9) and rounds
  half-up to the nearest kopeck at the point it's computed (brief
  decision #8) — this is what "per line" in decision #8 means in this
  engine: per category bucket, per discount-application step, not per
  physical `LineItem` row (there is no per-row rounding step; a
  `LineItem` never has its own price recomputed).

The final discounted items total is the sum of all buckets after all
steps. `shippingKopecks(order)` is added after, unmodified (brief
decision #2), to the already-floored items total.

**Consequences (testable):**
- Order: 600 kopecks `fresh` + 400 kopecks `standard`, Gold tier (10%), one
  coupon `FRESH20` (`category: "fresh"`, 20%, no min). Tier: fresh bucket
  600→540, standard bucket 400→360. Coupon: fresh bucket 540→432 (20% of
  540, exact, no rounding needed). Standard bucket untouched by the
  coupon. Items total = 432 + 360 = 792.
- Order: same buckets and tier, coupon `SAVE50` (`fixed`, 5 000 kopecks
  off, no category). After tier: fresh 540, standard 360, whole-order
  remaining 900. Split 5 000 proportional to 540:360 (3:2) → fresh share
  3 000, standard share 2 000 (exact here, no remainder tie-break needed
  in this example). Items total = (540−3000→floor 0) + (360−2000→floor
  0) = 0. `[ASSUMPTION worked example]` — demonstrates the floor applying
  per-bucket, consistent with FR-3's floor rule.
- A category with no items in the order has no bucket; a coupon scoped to
  that category is rejected (see FR-4) rather than silently contributing
  a 0 discount from a phantom bucket.

#### FR-4: Category-conflict precedence

If two *different, both-otherwise-valid* codes are scoped to the same
category, the first one in customer entry order is applied; the second is
rejected with `reason: "category_claimed"` (brief decision #6) — checked
after `not_found` / `expired` / `min_not_met` (FR-2) but before
`duplicate` (same-code repeats are a distinct case from different-code
same-category conflicts).

**Consequences (testable):**
- Codes `["FRESH20", "FRESHFEST"]`, both `category: "fresh"`, both
  otherwise valid: `FRESH20` applied, `FRESHFEST` rejected with
  `category_claimed`.
- A category coupon whose category has zero items in the order (no bucket
  exists) is a distinct case from both `category_claimed` (a real
  competing code) and `not_found` (the code itself doesn't exist).
  `[ASSUMPTION]` (memlog): added `reason: "no_matching_items"` for this
  case — a sixth reason the brief's four-item list didn't anticipate,
  since the brief only discusses categories that exist in the order.

### 4.4 Discount Result Reporting

**Description:** The engine's return value must carry both the numbers
(brief Success Criteria: "verifiable... via a test asserting the exact
expected total") and the per-code narrative (brief decision #7). This is
new data, additive only — `types.ts` shapes are not modified (brief
Out-of-Scope guardrail, `app/AGENTS.md` guardrail).

**Functional Requirements:**

#### FR-5: Deterministic, explicit reference time

The engine's entry point takes an explicit `asOf: Date` (or ISO string)
parameter for expiry comparisons, rather than reading `Date.now()`
internally. `[ASSUMPTION]` (memlog) — `pricing.ts`'s existing functions
are pure `(order) => number`; expiry inherently needs a clock, and an
implicit `Date.now()` inside a "pure" function makes every expiry test
flaky/time-dependent. The caller (e.g. `index.ts` or the checkout
handler) supplies `asOf`, defaulting to `new Date()` only at that outer
call site.

**Consequences (testable):**
- Two calls with the same `order`/`coupons` but different `asOf` values
  straddling a coupon's `expiresAt` produce different outcomes for that
  code, deterministically, with no wall-clock dependency in the test.

#### FR-6: Report every code's outcome and the final numbers

The engine returns, per order: the discounted items total, the unchanged
shipping fee, the grand total, and one outcome entry per **entered**
code (including rejected duplicates and over-cap codes) —
`{ code, applied: boolean, discountKopecks?: number, reason?: RejectionReason }`
where `RejectionReason` is one of: `not_found`, `expired`, `min_not_met`,
`category_claimed`, `no_matching_items`, `duplicate`, `too_many_codes`.
Realizes UJ-1, brief decision #7, and the brief's Success Criterion "the
checkout response says so explicitly" for expired codes (generalized here
to every rejection reason, not only expiry).

**Consequences (testable):**
- An order with one expired code and no other coupons has an unchanged
  items total (post-tier only) and a result list of length 1 with
  `applied: false, reason: "expired"`.
- Grand total = floored discounted items total + `shippingKopecks(order)`,
  and is never negative (brief decision #9; shipping itself is never
  discounted below its flat fee).

## 5. Non-Goals (Explicit)

- Changing `Order`, `LineItem`, `Coupon`, or the signatures of
  `lineTotalKopecks`, `subtotalKopecks`, `shippingKopecks`, `tierPercent`
  (brief guardrail, `app/AGENTS.md` guardrail).
- Coupon issuance, editing, disabling, or bulk-loading tooling — this
  engine consumes `Coupon[]` as given.
- Any checkout UI/receipt itemization work — FR-6's return shape supplies
  the data a future UI could use, but rendering it is out of scope.
- A general-purpose "N discount types" plugin architecture — the engine
  handles exactly two discount kinds (tier, coupon) with the stacking
  rules in §4.3; no speculative extensibility for hypothetical future
  discount types.

## 6. MVP Scope

### 6.1 In Scope

- FR-1 through FR-6, FR-2a — the full discount engine as specified above.
- Automated tests named after the acceptance criterion each covers
  (`app/AGENTS.md` convention), covering at minimum every "Consequences"
  bullet in §4.

### 6.2 Out of Scope for MVP

- Any cap-tuning UI or per-merchant configurable code limits — FR-2a's
  cap of 10 is a fixed constant, not a configuration surface.
- Localized/customer-facing copy for rejection reasons — FR-6 returns a
  machine-readable `reason` enum; translating that into a customer-facing
  message is a checkout-UI concern, not this engine's.

## 7. Success Metrics

**Primary**
- **SM-1**: Every FR-1–FR-6 "Consequences" bullet has a passing, named
  test asserting an exact kopeck total (not "some discount applied").
  Validates FR-1 through FR-6.
- **SM-2**: Across the brief's spot-check batch (single-item, multi-item,
  mixed-category, international-shipping, all-digital orders), the
  computed grand total matches a manual calculation exactly, run as an
  automated test. Validates FR-3, FR-6.

**Secondary**
- **SM-3**: `npm run typecheck` and `npm test` both pass with zero changes
  to `types.ts` or the signatures listed in §5. Validates the Non-Goals
  guardrail.

**Counter-metrics (do not optimize)**
- **SM-C1**: Do not chase "more discounts applied" as a metric — a higher
  apply-rate achieved by loosening FR-2's validation order or FR-4's
  category-conflict rule directly costs margin and contradicts the
  brief's fail-safe stacking choice. Counterbalances SM-1/SM-2.

## 8. Open Questions

1. **Real campaign code volume** — FR-2a's cap of 10 codes/order is a
   PM judgment call with no usage data behind it. Revisit once Growth's
   checkout UI ships and real per-order code counts are observable.
2. **Receipt/UI itemization** (brief, carried forward unchanged) — whether
   the tier discount and each applied coupon show as separate line items
   to the customer is a UX decision for a future UX spec; FR-6's result
   shape is designed to make that spec's job trivial when it happens.

## 9. Assumptions Index

- §4.2 FR-2 — `[ASSUMPTION]` catalog is an explicit `coupons: Coupon[]`
  parameter, not an implicit store.
- §4.2 FR-2 — `[ASSUMPTION]` unmatched code → `reason: "not_found"` (5th
  rejection reason beyond the brief's four).
- §4.2 FR-2 — `[ASSUMPTION]` repeat of the same code → `reason:
  "duplicate"`, reported explicitly rather than silently merged.
- §4.2 FR-2 — `[ASSUMPTION]` fixed validation-order precedence
  (`not_found` → `expired` → `min_not_met` → category-claim →
  `duplicate`) for codes that fail more than one check.
- §4.2 FR-2a — `[ASSUMPTION]` max-codes-per-order cap set to 10
  (brief left this open by design; resolved here, no usage data).
- §4.3 FR-3 — `[ASSUMPTION]` category-bucket model resolving how
  whole-order discounts (tier, non-category coupons) compose with
  category-scoped coupons — the central gap this PRD closes that the
  brief's decisions #1 and #3 left open between them.
- §4.3 FR-3 — `[ASSUMPTION]` proportional-split-with-deterministic-
  remainder rule for a non-category *fixed* coupon across buckets.
- §4.3 FR-4 — `[ASSUMPTION]` new `reason: "no_matching_items"` for a
  category coupon whose category has no items in the order (distinct from
  `not_found` and `category_claimed`).
- §4.4 FR-5 — `[ASSUMPTION]` explicit `asOf` parameter instead of an
  internal `Date.now()` read, for determinism/testability.
- §4.2 FR-2 Out of Scope — `[ASSUMPTION]` `Coupon` record data integrity
  (valid percent range, non-negative fixed value) is assumed guaranteed
  upstream, not validated by this engine.
