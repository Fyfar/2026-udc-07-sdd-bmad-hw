# Web-Verification Review — ARCHITECTURE-SPINE.md

**Target:** `_bmad/output/planning-artifacts/architecture/architecture-2026-udc-07-sdd-bmad-hw-2026-08-30/ARCHITECTURE-SPINE.md`
**Ground truth:** `app/package.json`, `app/tsconfig.json`, `app/src/types.ts`
**Reviewer role:** verify every committed decision was reality-checked (versions, technology existence/fit, live semantics) rather than asserted from training data.

## Verdict

One asserted technical claim (AD-8's causal link between `noUncheckedIndexedAccess` and the need for a bucket accessor) is **empirically wrong** — verified by compiling against the actual pinned-range TypeScript compiler — while every other checked claim (the three pinned versions, AD-9's `Math.round()` tie-break reasoning, and the `Array.sort()` default-order claim) is confirmed correct; the spine's functional rules are unaffected because they'd hold regardless of the flag.

No web access was available in this environment; version and language-semantics claims below were checked against the actual repo files and by **running the real, pinned-range TypeScript compiler (5.9.3, installed under `app/node_modules`, which satisfies the spine's stated `^5.6.0`) and Node 26** against isolated test cases — not just reasoned from training data. This is stronger than a web search for these two specific claims since it exercises the exact compiler version and exact types this project uses.

## Findings

### High

**AD-8 mechanism is misattributed — `noUncheckedIndexedAccess` does not affect this bucket type at all; `Partial<...>` alone causes the optional read.**

AD-8's "Prevents" clause claims: *"`noUncheckedIndexedAccess: true` (already on in `app/tsconfig.json`) forcing scattered non-null assertions or silent optional-chaining no-ops at every bucket read/write."* This attributes the `number | undefined` read type to the compiler flag. It does not hold for this codebase's actual `Category` type.

`app/src/types.ts` defines `category: "standard" | "fresh" | "digital"` — a **finite string-literal union**, not `string`. TypeScript resolves `Record<Category, number>` over a finite literal union to a mapped type with individually named properties, not an index signature — and `noUncheckedIndexedAccess` only adds `| undefined` to index-signature-style access (e.g. `Record<string, T>` / `{ [k: string]: T }`).

Verified empirically against the project's own pinned-range compiler (`app/node_modules/.bin/tsc`, v5.9.3, satisfies `^5.6.0`):

| Type under test | Access | `noUncheckedIndexedAccess: true` | `noUncheckedIndexedAccess: false` |
| --- | --- | --- | --- |
| `Record<Category, number>` | literal key `b["standard"]` | compiles as `number`, **no error** | compiles as `number`, no error |
| `Record<Category, number>` | variable-typed key `b[cat]` | compiles as `number`, **no error** | (not needed — same either way) |
| `Partial<Record<Category, number>>` | literal key `p["standard"]` | **TS2322: `number \| undefined` not assignable to `number`** | **same TS2322 error** |

The flag makes **zero observable difference** in any of these cases. The `number | undefined` typing on bucket reads comes entirely from `Partial<...>`, which is present in AD-8's own `Rule` line (`Partial<Record<LineItem["category"], number>>`) — and would produce exactly the same optional-read requirement with the flag off. AD-8 conflates two independent things: "Partial makes optional properties" (basic TS semantics, unconditional) and "noUncheckedIndexedAccess makes index-signature reads optional" (a flag effect that doesn't apply here because the key type is a finite literal union, not `string`).

**Impact:** none on the actual engineering advice — the `Rule` ("route every read through one private accessor... rather than asserting ad hoc") is sound and necessary regardless of *why* the type is optional, since `Partial<>` alone guarantees it. This is a documentation-accuracy defect, not a correctness risk to the build: a future reader relying on the "Prevents" reasoning to predict compiler behavior elsewhere (e.g. assuming turning the flag off would remove the need for the accessor) would be misled.

**Suggested fix:** reword AD-8's "Prevents" clause to credit `Partial<...>`, not `noUncheckedIndexedAccess`, as the source of the optional read — or drop the flag reference entirely, since it isn't doing any work in this specific type shape.

### Confirmed correct (no action needed)

- **Stack table exact match.** `TypeScript ^5.6.0`, `@types/node ^22.10.0`, `vitest ^2.1.0` in the spine's Stack table are byte-for-byte identical to `app/package.json`'s `devDependencies`. This is a direct read, not a fresh pick, and it's accurate. (Aside, not a defect: the actually-installed compiler resolves to 5.9.3, which satisfies the `^5.6.0` range — expected caret-range behavior, nothing to flag.)
- **AD-9's `Math.round()` tie-break claim.** Verified by running `Math.round()` in Node 26 (current LTS-era runtime) against every `x.5` boundary case from 0.5 up through 3.5, plus float-precision edges (`0.49999999999999994`, `2.5000000000000004`): every non-negative `.5` value rounds up (toward `+Infinity`), matching "half up" exactly, e.g. `Math.round(0.5) === 1`, `Math.round(2.5) === 3`. This is standard, version-stable ECMAScript spec behavior (unchanged since the language's early versions; `Math.round` ties always resolve toward `+Infinity`), and the spine correctly scopes the claim to non-negative inputs only — where it holds. (For completeness: negative ties also round toward `+Infinity`, e.g. `Math.round(-0.5) === -0`, which the spine doesn't rely on since bucket amounts are non-negative by construction per AD-9's own stated invariant.)
- **`Array.sort()` default-order claim** (Consistency Conventions table): tested `["standard","digital","fresh"].sort()` → `["digital","fresh","standard"]`, confirming default lexicographic sort produces the claimed `digital < fresh < standard` order with no custom comparator.
- **`noUncheckedIndexedAccess: true` is actually set in `app/tsconfig.json`** — spine's claim that it's "already on" is a direct, correct read of the file (verified by cat'ing it), separate from the AD-8 mechanism issue above.

### Low

- **No new technology/dependency claims to verify.** The spine adds zero new libraries and names no starter/scaffold (brownfield, not greenfield), so the "does each named technology still exist and fit" and "live defaults of a starter" parts of the review charter are structurally out of scope here — correctly, per the spine's own "Stack" note ("Brownfield, no new stack").
- **Environment caveat:** this review had no live web-search tool invoked (none was needed or used) — the two semantics claims were instead checked by *executing* the real pinned-version toolchain (tsc 5.9.3 satisfying `^5.6.0`, Node 26) rather than reasoning from memory alone, which is a stronger check than a web search would have been for these two specific, version-sensitive claims.

## Summary Table

| Claim | Location | Verified how | Result |
| --- | --- | --- | --- |
| TypeScript `^5.6.0` | Stack table | diff vs `app/package.json` | Match |
| `@types/node ^22.10.0` | Stack table | diff vs `app/package.json` | Match |
| `vitest ^2.1.0` | Stack table | diff vs `app/package.json` | Match |
| `noUncheckedIndexedAccess: true` is on | AD-8 | read `app/tsconfig.json` | Confirmed true |
| `noUncheckedIndexedAccess` forces the optional bucket read | AD-8 | compiled 4 isolated cases with `tsc` 5.9.3, flag on/off | **False** — `Partial<>` alone causes it; flag is a no-op for this literal-union key type |
| `Math.round()` ties round toward `+Infinity` (= half-up for non-negative inputs) | AD-9 | ran `Math.round()` in Node 26 over `.5` boundary and float-precision cases | Confirmed true |
| Default `Array.sort()` gives `digital < fresh < standard` | Consistency Conventions | ran `.sort()` in Node 26 | Confirmed true |
