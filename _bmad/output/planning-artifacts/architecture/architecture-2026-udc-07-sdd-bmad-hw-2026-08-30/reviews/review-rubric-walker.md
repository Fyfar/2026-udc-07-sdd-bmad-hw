# Rubric-Walker Review — ARCHITECTURE-SPINE (Checkout Discounts)

**Verdict: pass-with-fixes.** The spine is unusually thorough and correctly
resolves most of the PRD's genuine self-contradictions (AD-1, AD-2, AD-3
especially are strong work), stays faithful to the brownfield contract, and
matches the pinned toolchain exactly — but it leaves one real,
under-specified divergence point live (`min_not_met`'s basis vs. the
document's dominant "accumulator" framing) and one algorithm it claims to
own (AD-9) only partially restated.

---

## Critical

None. No FR is silently missing, nothing contradicts `types.ts`/`pricing.ts`,
no invented tech, no signature changes.

## High

**H-1. AD-1's Rule text is ambiguous about which per-entry checks read the
mutable accumulator vs. a frozen value — `min_not_met` is the outlier and
isn't called out.**

AD-1's Rule says: "For entry `i`, evaluate its checks (AD-2 through AD-5,
FR-2's precedence order) against the accumulator as left by entries `0..i-1`
only." Read as a blanket statement, this implies every per-entry check —
including `min_not_met` — is evaluated against accumulator/bucket state.
But FR-2 is explicit that `min_not_met` must use the order's **gross** items
subtotal, computed once via `subtotalKopecks(order)`, pre-tier and
pre-any-coupon — a value that never changes across the fold, unlike
`category_claimed` (AD-2, genuinely accumulator-based) and `duplicate`
(AD-4, genuinely accumulator-based). Nothing in the AD-1–AD-5 block states
that `min_not_met`, `not_found`, `expired`, and `no_matching_items` don't
have dedicated ADs at all and default back to FR-2's prose — and the
Design Paradigm's mention of reusing `subtotalKopecks` is an aside, not a
Rule.

This matters precisely because the rest of the document trains the reader
into an accumulator/"remaining" mental model (Glossary: "Category bucket…
the running **remaining**-subtotal…"; "Discount base… the whole-order
**remaining** subtotal"). An implementer who internalizes that model and
reads AD-1's Rule literally could plausibly check `min_not_met` against the
*current* remaining bucket sum after some discounts have already reduced it
— producing a different `applied`/`rejected` outcome than an implementer
who reads FR-2's "gross" wording carefully. That's exactly the
two-engineers-diverge risk this spine exists to close, on a test-bearing
FR (Story 2.2).

**Fix:** add one sentence to AD-1 (or a new short AD) stating explicitly
that `min_not_met` is evaluated once, against `subtotalKopecks(order)`
(pre-tier, pre-any-coupon, computed identically for every entry regardless
of position), and is the one FR-2 check that does **not** read the fold
accumulator — unlike `category_claimed`/`duplicate`, which do.

## Medium

**M-1. AD-9 ("Rounding primitive") doesn't restate the remainder-assignment
algorithm for the proportional fixed-coupon split — only the rounding
primitive itself.**

FR-3/Story 3.2 describe a two-step algorithm for a non-category *fixed*
coupon: (a) split proportional to each bucket's current share, round
half-up per bucket, then (b) assign any single leftover/shortfall kopeck to
the bucket with the largest *current* remaining value (ties broken
alphabetically). AD-9's Rule only covers step (a) — "round every per-step
discount amount… once, at the point it's computed" — and never states step
(b) as an enforceable Rule; the tie-break order appears only in the
Consistency Conventions table, disconnected from the assignment mechanic
itself. Two implementers could reasonably diverge on: is the diff computed
as `total − Σ(rounded shares)` and added to one bucket in one shot, or
distributed kopeck-by-kopeck in a loop? Do ties use the *pre-split* bucket
value (the same figure used to compute the proportional weights) or the
*post-split* value?

In practice this is low-risk *behaviorally* — for this domain (max 3
categories), the maximum possible rounding discrepancy after independent
half-up rounding of shares that sum exactly to an integer total is
provably ≤ 1 kopeck, so "assign the single kopeck to the largest bucket"
is always sufficient and any reasonable implementation converges to the
same answer. But that bound is never stated or justified anywhere in the
spine, so the "single leftover kopeck" assumption reads as inherited
PRD prose rather than a verified architectural guarantee, and AD-9's own
Rule doesn't fully cover what its title claims to own.

**Fix:** either fold the remainder-assignment mechanic into AD-9's Rule
explicitly (compute `diff = fixedValue − Σ(Math.round(shares))`, assign the
whole diff to the bucket with the largest *pre-split* remaining value, tie
broken by category name ascending), or add a short note recording that the
≤3-category domain bounds the discrepancy to a single kopeck, so the
PRD's "single leftover kopeck" language is a proven invariant, not an
assumption.

## Low

- **AD-1's `binds` list omits FR-1**, even though its Rule text explicitly
  fixes the tier step's position ("after the tier step has run once
  against freshly-initialized buckets") — a traceability nit, not a
  substantive gap (FR-1 is otherwise adequately covered by
  `pricing.ts`'s existing full spec of `tierPercent`).
- **AD-7 doesn't specify expiry-comparison mechanics** (Date object vs.
  ISO-string comparison, timezone parsing of `Coupon.expiresAt`). Very
  low real risk — `new Date(coupon.expiresAt) <= asOf` is the only
  natural reading and JS Date comparison is well-defined — but the spine
  is silent on it where it's silent on little else.
- **The PRD's rationale that "X% off each bucket equals X% off the sum"
  is not exactly true under integer half-up rounding** (e.g., two
  333-kopeck buckets at 5% independently round to 632 total vs. 633 if
  the whole 666 were rounded once) — the spine inherits this claim
  without flagging or correcting it. No actual divergence risk, since
  AD-9's Rule ("round every per-step amount… per bucket") is itself
  unambiguous and both builders would still produce 632 — but it's an
  inaccurate piece of inherited rationale the spine could have corrected
  while it was fixing everything else.

---

## What the spine got right (for calibration)

- AD-1 (interleaved single pass), AD-2 (self-claim exclusion), AD-3
  (position-based cap, explicitly resolving FR-2a's internal
  contradiction), AD-4 (duplicate tracking scope), and AD-5 (first-match
  catalog lookup) each name a real fork two independent builders would hit
  and pick a side with a stated reason — this is exactly what an
  architecture spine at this altitude should do.
- Tech table (TypeScript ^5.6.0, vitest ^2.1.0, @types/node ^22.10.0,
  Node 22+) matches `app/package.json` exactly — verified directly against
  the file, not just cross-referenced.
- AD-8's bucket representation is a correct, minimal response to
  `noUncheckedIndexedAccess: true` (confirmed on in `app/tsconfig.json`),
  and it's the right kind of decision for this altitude (a TS-strictness
  consequence, not a business rule).
- Brownfield fidelity is clean: `types.ts` and `pricing.ts` are correctly
  marked UNCHANGED, `index.ts`'s current re-export shape was read and
  matches what AD-6 assumes, and no new file/module layout choice was left
  to inference.
- The Deferred section is genuinely inert — nothing in it could cause
  behavioral divergence in `discounts.ts` itself.
- Correctly omits a Deployment & Environments section — this is a pure TS
  library with no HTTP/infra surface in `app/`, so the absence is
  justified by scope, not a gap.
