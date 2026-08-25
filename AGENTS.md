# AGENTS.md

Baseline guidance for an Agentic IDE working in **this homework repo**.

> UDC Workshop 7 homework — Spec Driven Development + BMAD. Participants turn a
> deliberately ambiguous business ticket into a verifiable specification, run it
> through an SDD tool, implement it with traceability back to the spec, and
> A/B it against ad-hoc development. See `docs/walkthrough.md`.

## Context

- `app/` is a small TypeScript **order-pricing domain**. All money is in
  **integer cents** — never introduce floating-point arithmetic for amounts.
  - `app/src/types.ts` — `Order`, `LineItem`, `Coupon`. Stable contract.
  - `app/src/pricing.ts` — `lineTotalCents`, `subtotalCents`, `shippingCents`,
    `tierPercent`. **Protected: do not change these signatures or behaviour.**
  - `cd app && npm install && npm test` is green (8 tests) from the start.
- **The discount engine does not exist yet** — building it from a spec is the
  homework.
- `materials/feature-request.md` is a deliberately **ambiguous** ticket. Its
  ambiguity is the whole point of the exercise — **do not "fix" or rewrite it**.
- Graded by CodeRabbit (`.coderabbit.yaml`) against the Definition of Done in
  `docs/walkthrough.md`.

## Conventions

- Documentation language: Ukrainian or English (participant's choice).
- Keep deliverables at the agreed paths so auto-review can find them:
  - `docs/spec/pricing-discounts.md` — the specification (Task A)
  - the chosen SDD tool's own artifacts (`openspec/`, `specs/`, `.specify/`,
    `_bmad/`, `.kiro/`) + `docs/sdd-tool.md` (Task B)
  - the implementation in `app/src/` + tests named after AC ids (Task C)
  - `docs/traceability.md` (Task C)
  - `docs/ab-validation.md` (Task D)
  - `docs/task-e-bonus.md` (Task E, bonus)
- Tests should be **named after the acceptance criterion they cover** (e.g.
  `AC-3: two coupons on the same category`) so the link to the spec is visible
  in the test output.

## Guardrails

- **NEVER** change the signatures in `app/src/pricing.ts` or the shapes in
  `app/src/types.ts` — they are the seeded contract.
- **NEVER** edit `materials/feature-request.md`. The ambiguity is deliberate.
- **NEVER** commit secrets or `.env`.
- Money is integer cents. If a rounding decision is needed, it belongs in the
  **spec** first, then in the code — not invented in the implementation.
- Do not add behaviour the specification did not ask for. Unrequested additions
  are a named category in the reverse traceability check, and they will be
  found.
- **Windows + Git Bash:** never use `2>nul` / `>nul` (creates a literal `nul`
  file). Use `2>/dev/null`. `nul` is gitignored as a net.

## How to verify

Before opening a PR: `cd app && npm test` is green; every acceptance criterion
in the spec has a row in `docs/traceability.md` pointing at real code and a real
test; the reverse check is filled in; and `docs/ab-validation.md` records two
actual runs rather than placeholders.
