## Purpose

Turns an order plus a coupon catalogue into a price breakdown: how much the
customer's loyalty tier took off, how much a promo code took off, what shipping
costs, what is due — and, for every code that did not apply, a machine-readable
reason why. Source of decisions: `docs/spec/pricing-discounts.md` (D-1…D-17).

## ADDED Requirements

### Requirement: Price breakdown output

The engine SHALL accept an order, a coupon catalogue, and an evaluation instant,
and SHALL return a breakdown containing: the raw item subtotal, the tier
discount, the coupon discount, the single applied coupon (or none), every
rejected code with its reason, the shipping cost, and the total due.

The evaluation instant SHALL be an injectable parameter defaulting to the
current time, so that expiry boundaries are deterministically testable (D-12).

Coupon codes SHALL be matched against the catalogue exactly — case-sensitive,
whitespace-sensitive, with no normalisation (§2).

#### Scenario: AC-15(в) — the breakdown reconciles
- **WHEN** any order is priced with any set of codes and every catalogue coupon satisfies the contract checks
- **THEN** `totalKopecks` equals `subtotalKopecks − tierDiscountKopecks − couponDiscountKopecks + shippingKopecks`

#### Scenario: AC-15(г) — every amount is whole kopecks
- **WHEN** any order is priced
- **THEN** every numeric field of the breakdown satisfies `Number.isInteger`

### Requirement: Tier discount applies to the whole item subtotal

The engine SHALL reduce the order by the customer's tier percentage — none 0%,
silver 5%, gold 10% — computed against the full item subtotal with no category
restriction (D-11). Shipping SHALL NOT be part of that base (D-2).

#### Scenario: AC-1 — gold tier finally reduces the bill
- **WHEN** a gold customer orders 100 000 kopecks of physical goods to UA with no codes
- **THEN** `tierDiscountKopecks = 10_000`, `couponDiscountKopecks = 0`, `shippingKopecks = 4_900`, and `totalKopecks = 94_900`

### Requirement: Tier and coupon apply sequentially, tier first

The engine SHALL apply the tier discount to the item subtotal, then apply the
coupon to what remains — never summing the two percentages (D-1).

#### Scenario: AC-5 — gold plus a 15% code is 23 500, not 25 000
- **WHEN** a gold customer orders 100 000 with valid code `AUTUMN15` (percent 15, no category, no threshold)
- **THEN** `tierDiscountKopecks = 10_000`, the coupon base is `90_000`, `couponDiscountKopecks = 13_500`, and `totalKopecks = 81_400`

### Requirement: At most one coupon applies, the most valuable one

The engine SHALL evaluate each accepted coupon independently, as if it were the
only one, and SHALL apply exactly the one yielding the largest absolute discount
in kopecks (D-3, D-16). Comparison SHALL be by kopecks, never by nominal
percentage. On a tie, the coupon appearing earlier in the customer's typed order
SHALL win. Every other accepted coupon SHALL be rejected with reason `not-best`.

#### Scenario: AC-3 — the larger of two category coupons wins
- **WHEN** a silver customer orders fresh 40 000 + standard 60 000 and types `FRESH20` (percent 20, category fresh) then `FRESH50` (fixed 5 000, category fresh)
- **THEN** `FRESH20` applies for `7_600`, `rejectedCoupons = [{ code: "FRESH50", reason: "not-best" }]`, and `totalKopecks = 92_300`

#### Scenario: AC-19 — kopecks beat percentages
- **WHEN** an untiered customer orders fresh 5 000 + standard 95 000 and types `WIDE5` (percent 5, no category) and `FRESH50` (percent 50, category fresh)
- **THEN** `WIDE5` applies for `5_000`, `FRESH50` is rejected as `not-best`, and `totalKopecks = 99_900`

#### Scenario: AC-16 — a tie is broken by typing order, not catalogue order
- **WHEN** an untiered customer orders 100 000, the catalogue is `[TIE_A (percent 10), TIE_B (fixed 10_000)]`, and the typed codes are `["TIE_B", "TIE_A"]`
- **THEN** `appliedCoupon = { code: "TIE_B", discountKopecks: 10_000 }` and `rejectedCoupons = [{ code: "TIE_A", reason: "not-best" }]`

### Requirement: A category coupon is computed from that category alone

A coupon carrying a category SHALL be computed against the sum of that
category's line items, itself already reduced by the tier percentage —
`categorySubtotal − floor(categorySubtotal × tierPercent ÷ 100)` — and never
against the whole order (D-5).

A category coupon SHALL be rejected with reason `no-matching-items` when the
order contains no line item of that category, rather than applied for zero
(D-14).

#### Scenario: AC-6 — 20% off fresh means 20% of fresh
- **WHEN** a silver customer orders fresh 40 000 + standard 60 000 with `FRESH20` (percent 20, category fresh)
- **THEN** `couponDiscountKopecks = 7_600` — neither `19_000` nor `8_000` — and `totalKopecks = 92_300`

#### Scenario: AC-13 — no items of the coupon's category
- **WHEN** an order of standard-only goods for 100 000 is priced with `FRESH20` (percent 20, category fresh)
- **THEN** `rejectedCoupons = [{ code: "FRESH20", reason: "no-matching-items" }]`, `appliedCoupon = null`, and `couponDiscountKopecks = 0`

### Requirement: Minimum-subtotal threshold is checked against the raw subtotal

A coupon's `minSubtotalKopecks` SHALL be compared against the raw item subtotal,
before the tier discount and before any coupon, and the comparison SHALL be
inclusive: `subtotal >= minSubtotalKopecks` passes (D-6). A coupon failing it
SHALL be rejected with reason `below-min-subtotal`.

#### Scenario: AC-7 — exactly at the threshold, a gold customer keeps the coupon
- **WHEN** a gold customer's subtotal is exactly 100 000 and `BIG10` requires `minSubtotalKopecks: 100_000`
- **THEN** the coupon applies: `tierDiscountKopecks = 10_000`, `couponDiscountKopecks = 9_000`, `totalKopecks = 85_900`

#### Scenario: AC-14 — one kopeck short
- **WHEN** the subtotal is 99 999 and `BIG10` requires `minSubtotalKopecks: 100_000`
- **THEN** `rejectedCoupons = [{ code: "BIG10", reason: "below-min-subtotal" }]` and `couponDiscountKopecks = 0`

### Requirement: Expiry boundary is exclusive

A coupon SHALL be treated as expired when the evaluation instant is at or after
its `expiresAt` instant, and SHALL be rejected with reason `expired` (D-12).

#### Scenario: AC-11a — at the expiry instant the coupon is already dead
- **WHEN** `EDGE` expires at `2026-09-01T00:00:00.000Z` and the order is priced at exactly that instant
- **THEN** `rejectedCoupons = [{ code: "EDGE", reason: "expired" }]` and `couponDiscountKopecks = 0`

#### Scenario: AC-11b — one millisecond earlier it still works
- **WHEN** the same `EDGE` (percent 10) is evaluated at `2026-08-31T23:59:59.999Z` on an order of 100 000
- **THEN** `couponDiscountKopecks = 10_000` and `rejectedCoupons` is empty

#### Scenario: AC-2 — an expired code does not block checkout
- **WHEN** a silver customer orders 100 000 with `SAVE15` expired on `2026-08-01`
- **THEN** no exception is raised, `appliedCoupon = null`, `rejectedCoupons = [{ code: "SAVE15", reason: "expired" }]`, `tierDiscountKopecks = 5_000`, and `totalKopecks = 99_900`

### Requirement: Coupons contradicting the type contract are rejected as invalid

A coupon SHALL be rejected with reason `invalid`, and this check SHALL run
**before** the expiry check, when any of the following holds (D-17):
its `value` is not a finite number, or is negative; its kind is percent and its
value exceeds 100; its kind is fixed and its value is not an integer; or its
`expiresAt` is not a parseable date.

`minSubtotalKopecks` SHALL NOT be validated — a negative threshold is simply
always satisfied.

#### Scenario: AC-17 — a percentage above 100
- **WHEN** an order of 10 000 is priced with `BROKEN` (percent, value 150)
- **THEN** `rejectedCoupons = [{ code: "BROKEN", reason: "invalid" }]`, `couponDiscountKopecks = 0`, and `totalKopecks = 14_900`

#### Scenario: AC-18 — an unparseable expiry date does not become an eternal coupon
- **WHEN** an order of 10 000 is priced with `JUNKDATE` (percent 10, `expiresAt: "не дата"`)
- **THEN** `rejectedCoupons = [{ code: "JUNKDATE", reason: "invalid" }]`, `appliedCoupon = null`, and `totalKopecks = 14_900`

### Requirement: Every unique typed code is accounted for exactly once

The engine SHALL de-duplicate the typed codes by exact value, keeping the first
occurrence (D-10). The applied coupon's code plus the rejected codes SHALL form
exactly the set of unique typed codes, each appearing once. Rejected codes SHALL
be listed in the order the customer typed them, regardless of rejection reason
(D-3, D-10).

A code absent from the catalogue SHALL be rejected with reason `unknown` (D-9).

#### Scenario: AC-12 — the same code typed twice discounts once
- **WHEN** the typed codes are `["SAVE10", "SAVE10"]` and `SAVE10` is a valid percent 10 on an order of 100 000 with no tier
- **THEN** `couponDiscountKopecks = 10_000` — not 20 000 and not 19 000 — `rejectedCoupons` is empty, and `totalKopecks = 94_900`

#### Scenario: AC-10 — a code that does not exist
- **WHEN** `NOSUCHCODE` is typed on an untiered order of 100 000 and is absent from the catalogue
- **THEN** `rejectedCoupons = [{ code: "NOSUCHCODE", reason: "unknown" }]`, `couponDiscountKopecks = 0`, `totalKopecks = 104_900`, and no exception is raised

#### Scenario: AC-15(а) — completeness and ordering
- **WHEN** any order is priced with any set of typed codes
- **THEN** the rejected codes plus the applied code are exactly the unique typed codes, each once, with rejections in typing order

### Requirement: Shipping is never discounted and the total never goes negative

Shipping SHALL be taken from the existing shipping rule, SHALL NOT be reduced by
a tier or a coupon, and SHALL be added after the discounted goods amount is
floored at zero (D-2, D-7). Consequently the total due SHALL never be less than
the shipping cost, and a fixed-value coupon SHALL discount at most its own base:
`min(value, base)`, with the remainder forfeited rather than carried to another
category or to shipping (D-15).

#### Scenario: AC-4 — a coupon larger than the order
- **WHEN** an untiered order of 10 000 is priced with `MEGA` (fixed 200 000)
- **THEN** `couponDiscountKopecks = 10_000`, the goods amount is `0`, and `totalKopecks = 4_900` — the shipping cost, not a negative number

#### Scenario: AC-9 — an empty order
- **WHEN** a gold customer's order has no items and no codes
- **THEN** `subtotalKopecks = 0`, `tierDiscountKopecks = 0`, `couponDiscountKopecks = 0`, `shippingKopecks = 0`, and `totalKopecks = 0`

#### Scenario: AC-15(б) — discounts never exceed the goods
- **WHEN** any order is priced and every catalogue coupon satisfies the contract checks
- **THEN** `subtotalKopecks − tierDiscountKopecks − couponDiscountKopecks >= 0`

### Requirement: Rounding is floor, per discount, in kopecks

Each discount SHALL be rounded down to whole kopecks independently, immediately
after its division by 100. No intermediate fractional amount SHALL exist (D-4).

#### Scenario: AC-8 — half a kopeck goes to the shop
- **WHEN** an untiered order of a single 33 333-kopeck item is priced with `P15` (percent 15)
- **THEN** `couponDiscountKopecks = 4_999` — not 5 000 — the goods amount is `28_334`, and `totalKopecks = 33_234`

### Requirement: The engine never throws

The engine SHALL be a pure function that always returns a breakdown. No input —
an expired code, an unknown code, a malformed coupon, an empty order — SHALL
cause it to raise (D-8). Rejection reasons SHALL be machine-readable enum
values, not human-facing text; localisation is the caller's concern.

#### Scenario: Malformed and unusable codes together
- **WHEN** an order is priced with a mix of unknown, expired, malformed and below-threshold codes
- **THEN** the call returns normally, the goods and shipping are still computed, and each code carries its own reason
