---
title: Addendum — Checkout Discounts PRD
related: prd.md
---

# Addendum: Rationale for PRD-Level Decisions Beyond the Brief

The product brief's nine Key Decisions resolve every fork the ticket poses
*in isolation*. This PRD had to resolve a further layer: what happens when
two of those decisions are both true on the same order at once. That
layer — the category-bucket model (FR-3), the catalog/clock parameters
(FR-2, FR-5), and the extra rejection reasons (FR-2, FR-4, FR-2a) — is
implementation-adjacent enough that it belongs here, not padded into the
PRD's feature narrative. Kept here per PRD discipline: the brief's own
addendum already documents options-considered for the *brief's* decisions;
this addendum only covers what *this PRD* added on top.

## A. Category buckets: why not simpler alternatives?

**Chosen:** per-category running-subtotal buckets; tier and non-category
coupons act on every bucket, category coupons act on one bucket (PRD §4.3
FR-3).

**Rejected: category coupons always compute off the ORIGINAL (pre-tier,
pre-any-coupon) category subtotal, regardless of stacking order.**
This satisfies brief decision #3 ("category subtotal") in isolation but
silently breaks brief decision #1's "sequential... on the remaining
amount" for every category coupon — the category coupon would never see
the tier discount's effect. Two customers with identical carts but
different tiers would get identical category-coupon kopeck amounts, which
contradicts "sequential" as plainly as additive stacking would.

**Rejected: no per-category tracking — treat the whole order as one
number, and let a category coupon apply its percent to "the current
whole-order remaining amount attributed to that category" by re-deriving
each category's *proportional share* of gross subtotal every time, rather
than carrying a running per-bucket state.**
Mathematically converges to the same number as the bucket model *only* if
every discount before it was itself uniform-percentage across categories
(true for tier and percent coupons, false the moment a category coupon or
a fixed-value coupon has already run) — so this alternative silently
drifts from "sequential" after the first category-scoped or fixed-value
discount in the chain. The bucket model was chosen because it's the only
one of the three that stays correct under an arbitrary mix of
category/non-category, percent/fixed discounts in any entry order, which
is exactly what "customer can enter several codes" (brief) implies must
be supported.

**Rejected: forbid mixing a category coupon with any other coupon
touching that category, i.e. simplify the problem away by making the
combination illegal.**
Not supportable — brief decision #6 explicitly contemplates two codes
targeting the same category (that's the fork it resolves with
"first-wins"), so the combination is an expected, tested scenario, not an
edge case to reject at the type level.

## B. Fixed-value non-category coupon: proportional split rule

**Chosen:** split the flat kopeck amount across category buckets
proportional to each bucket's current share of the whole-order remaining
total; round half-up per bucket; assign any leftover/shortfall kopeck to
the bucket with the largest current remaining value, ties broken by
category name ascending (`digital` < `fresh` < `standard`).

**Rejected: apply the fixed amount to a single "undifferentiated" total
and only reduce category buckets lazily, if and when a later category
coupon asks.**
Defers the allocation problem instead of solving it, and produces a
different answer depending on whether a category coupon happens to appear
later in the same order — non-deterministic from the spec's point of
view even though the *engine's* output would be deterministic per call.
Rejected on the same "no interpretation-dependent behavior" ground the
brief's decision #4 rationale uses.

**Rejected: apply the fixed amount only against the largest bucket (or the
first-listed category), ignoring proportionality.**
Cheaper to implement, but produces a customer-visible total that depends
on cart composition in a way nothing in the ticket asks for, and would be
the single hardest rule for a support agent to explain by hand — directly
opposed to the reasoning the brief's addendum gives for choosing
round-half-up over banker's rounding in decision #8 ("simplest rule a
support agent... can verify by hand").

**Note on the remainder tie-break:** an alphabetical tie-break was chosen
purely for determinism (so the same order always produces the same
result, required for FR-6's exact-total tests); it has no product meaning
and the specific letter order is arbitrary. If this ever becomes
customer-visible in a way that matters, it should be revisited — flagged
here rather than in the PRD body since it's an implementation-facing
footnote, not a product decision Growth would care about.

## C. Explicit `asOf` and `coupons: Coupon[]` parameters

**Chosen:** the engine's entry point is a pure function of
`(order, coupons: Coupon[], asOf: Date)`.

**Rejected: read `Date.now()` and an implicit coupon-store singleton
inside the engine, matching how a real service might eventually wire it.**
`pricing.ts`'s existing functions are pure and take only `Order`; the
homework's stated ambiguity surface is stacking/rounding/precedence, not
service architecture. Introducing an implicit clock or store here would
make FR-6's "assert an exact expected total" tests (the brief's own
Success Criteria language) flaky or require mocking global state — a
self-inflicted testability problem with no product benefit. This is
flagged as implementation-level rather than a product decision, but it's
recorded here because `app/AGENTS.md` treats "the code needs a decision
the spec doesn't state" as a spec bug, and an implicit clock inside a
"pure" pricing function is exactly that kind of undocumented dependency.

## D. Extra rejection reasons (`not_found`, `no_matching_items`, `duplicate`, `too_many_codes`)

**Chosen:** four rejection reasons beyond the brief's original four
(`expired`, `category_mismatch`→renamed `min_not_met`+`no_matching_items`
split, `min_not_met`, `category_claimed`).

**Rejected: fold `not_found` into `expired`** (treat an unknown code as
"expired" since both mean "this code doesn't currently work"). Rejected
because it's actively misleading to the customer — "expired" implies the
code once worked, inviting a support contact about *when* it stopped
working, versus `not_found` which correctly signals a typo or a code that
was never issued for this store.

**Rejected: fold `no_matching_items` into `category_claimed`** (treat "no
items in this category" as if some other code claimed it). Rejected
because the customer-facing implication is different — `category_claimed`
implies "you could have gotten this discount, another code beat you to
it," while `no_matching_items` implies "this code doesn't apply to
anything in your cart," which is the true state and a materially
different message a checkout UI would want to show.

## Sizing note (carried forward from the brief's addendum)

This PRD, like the brief it extends, treats the work as an internal
engineering change with a named stakeholder and a two-week deadline — not
a new product needing market discovery. No web-research subagents were
spawned during PRD drafting for this reason; the brief's own addendum
already made this call for the brief, and nothing in the ticket or brief
changes that calculus for the PRD.
