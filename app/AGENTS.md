# AGENTS.md — pricing app

Guidance for an Agentic IDE working inside `app/`.

## Stack

- TypeScript (ES2022, NodeNext), Node 22+
- vitest, colocated `*.test.ts`
- No runtime dependencies — a plain domain library

## Commands

```bash
npm install
npm test          # vitest run
npm run typecheck # tsc, no emit
```

## Architecture

- `src/types.ts` — `Order`, `LineItem`, `Coupon`. Amounts are **integer cents**.
- `src/pricing.ts` — pure, already-specified behaviour: line totals, subtotal,
  shipping, tier percentage.
- `src/index.ts` — public surface.

The discount engine is **not here yet** — it is what the homework builds, from
a written specification rather than from a ticket.

## Conventions

- Named exports only.
- No `any`. Money stays in integer cents — no floats for amounts.
- `.js` extension on relative imports (NodeNext), even from `.ts` sources.
- Name tests after the acceptance criterion they cover, so the spec link shows
  up in the test output.

## Guardrails

- **Do not change** the signatures of `lineTotalCents`, `subtotalCents`,
  `shippingCents`, `tierPercent`, or the shapes in `types.ts` — the seeded
  contract depends on them.
- Rounding, discount stacking order and coupon precedence are **specification
  decisions**. If the code needs one and the spec does not state it, the spec is
  incomplete — fix the spec first.
- Never add real business data or secrets; everything here is synthetic.
