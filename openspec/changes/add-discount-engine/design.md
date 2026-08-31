## Context

See `proposal.md` — Why. The constraints that shape the approach:

- `src/pricing.ts` (`lineTotalKopecks`, `subtotalKopecks`, `shippingKopecks`,
  `tierPercent`) and `src/types.ts` are a **seeded contract**: signatures and
  shapes must not change. The engine composes them, it does not touch them.
- Money is whole kopecks. No floating-point arithmetic on amounts; every
  intermediate value stays an integer.
- No runtime dependencies. TypeScript ES2022/NodeNext, `.js` extensions on
  relative imports, named exports, no `any`. Tests run under vitest.
- The behaviour is already decided in `docs/spec/pricing-discounts.md`
  (D-1…D-17). This design chooses **how** to realise it, not **what** it is.

Design-level ambiguity worth settling before code: the order of the validation
checks, the order of the returned rejections, and where rounding happens. Each
of these changes the returned numbers, and each is where two honest
implementations diverge.

## Goals / Non-Goals

**Goals:**

- One pure function, one file, no state, no I/O — trivially testable.
- A normative step order precise enough that two implementations produce
  byte-identical breakdowns on identical inputs.
- Every acceptance criterion in the spec expressible as a single vitest case
  named after its id, so `docs/traceability.md` can point at real lines.

**Non-Goals:**

- No coupon repository, cache, or catalogue loader — the catalogue arrives as
  an argument.
- No abstraction over "discount kinds": there are exactly two (`percent`,
  `fixed`) and they are fixed by `types.ts`. A strategy registry would be
  indirection with one caller.
- No performance work. Orders are tens of lines and coupons are a handful;
  an O(codes × items) scan is not a problem worth structure.

## Decisions

### Single module, single exported function

`src/discounts.ts` exports `priceOrder` plus the result types; `src/index.ts`
re-exports them. Internal helpers (validation, candidate discount) stay
module-private and unexported.

*Alternative considered:* splitting validation, category resolution and
selection into separate modules. Rejected — the whole engine is under ~120
lines, and three files would spread one cohesive algorithm across three places
without a second caller to justify the seams.

### Two passes over the deduplicated codes, not one

Pass 1 classifies each unique code: either a rejection reason, or a candidate
with its computed discount. Pass 2 selects the best candidate and marks the
rest `not-best`, then walks the deduplicated list **again** to emit
`rejectedCoupons` in typing order.

*Why:* `not-best` is only knowable after every candidate is priced, so a
single pass would emit rejections in "reason assignment" order — step-4 failures
first, `not-best` last. AC-15(а) requires typing order regardless of reason
(D-3). The second walk is the cheapest way to guarantee it, and it makes the
completeness invariant (`applied + rejected = unique typed codes`) structural
rather than something to be careful about.

*Alternative considered:* sorting the rejections by index at the end. Same
result, but it needs the index carried around; re-walking the source list is
less bookkeeping.

### Check order inside classification is normative

For each unique code, the **first** matching condition is the reason:
`unknown` → `invalid` → `expired` → `below-min-subtotal` → `no-matching-items`
→ candidate.

*Why `invalid` before `expired`:* an unparseable `expiresAt` yields `NaN`, and
every comparison against `NaN` is false — so an unvalidated coupon with a junk
date would never expire (D-17, AC-18). Contract validation must therefore run
before any date comparison, not after it.

*Why the rest in that order:* it goes from "we know nothing about this coupon"
to "the coupon is fine but this order does not qualify" — the reason a customer
sees is always the most specific fact that is true. Any other order changes the
reason string for codes that fail two checks at once, and the spec's ACs pin it.

### Rounding: `Math.floor` immediately after each division

The tier discount and the coupon discount are each floored at the moment they
are computed (D-4). There is no fractional intermediate anywhere, so the
"integer kopecks" invariant holds on every value, not only on the total.

*Alternative considered:* computing in exact rationals and rounding once at the
end. Rejected — it makes `subtotal − tier − coupon` stop reconciling with the
displayed per-line discounts, which is exactly what AC-15(в) forbids.

### The evaluation instant is a parameter

`priceOrder(order, catalog, now = new Date())`. Calling `Date.now()` inside
would make AC-11a/AC-11b (the exact expiry millisecond) untestable without
faking timers.

### Category base reuses the tier percentage, not the tier discount

For a category coupon the base is
`categorySubtotal − floor(categorySubtotal × tierPercent ÷ 100)` — the
percentage re-applied to the narrower base, **not** a proportional share of the
already-computed order-level tier discount (D-5). Apportioning would introduce a
second rounding step whose result depends on the split, and category bases would
no longer sum to the order base.

### Guard clauses over an accumulating pipeline

`Math.max(0, …)` on the goods amount and `Math.min(value, base)` on fixed
coupons are one-liners at the point of use. Per D-7 the zero-floor is
unreachable for in-contract data — it is retained as a guard for data that
somehow bypassed D-17, and marked as such in a comment rather than removed.

### Tests: one case per AC id, plus a loop for the invariant

`src/discounts.test.ts`, cases named `AC-1: …` through `AC-19: …` (AC-11 split
into 11a/11b) so the spec link shows in vitest output. AC-15 is an invariant,
not an example: a few thousand iterations of a seeded pseudo-random order
generator asserting (а)…(г) in a plain loop. No property-testing framework —
a `for` loop and `expect` cover it, and a new dev dependency for one test is not
worth the install.

## Risks / Trade-offs

- **Only one coupon can ever apply.** → Deliberate (D-3): it bounds campaign
  cost and removes order-dependence. If stacking is ever wanted, it is a new
  spec decision, not a code tweak; the two-pass structure makes the change
  local to the selection step.
- **Rejected coupon codes are echoed back verbatim.** → The engine does not
  normalise or sanitise them (§2). Any UI rendering them must escape them;
  callers that want trim/uppercase do it before calling.
- **`invalid` collapses four distinct data faults into one reason.** →
  Accepted: the customer-facing message is the same ("this code isn't usable"),
  and splitting it would expand the enum for a case only marketing's admin panel
  can create. Revisit if operators need the diagnostics.
- **Floor-per-discount costs the customer up to 1 kopeck per discount.** →
  Accepted and specified (D-4). The alternative direction costs the shop
  instead; either way it must be one rule system-wide, and this is it.
- **Category coupons scan the item list per candidate.** → O(codes × items),
  irrelevant at checkout sizes. If a catalogue ever grows into the hundreds, a
  single pre-pass grouping items by category replaces it without changing
  behaviour.

## Migration Plan

Purely additive: a new module, a new test file, and two re-export lines in
`src/index.ts`. Nothing calls `priceOrder` until a caller opts in, so the
rollback is deleting the file. No data migration, no feature flag.
