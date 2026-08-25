# UDC Workshop 7 — Spec Driven Development + BMAD

Домашнє завдання: перетворити навмисно неоднозначний тікет на специфікацію,
проженіть її через SDD-інструмент, реалізувати з простежуваністю до критеріїв
приймання — і A/B-тестом перевірити, чи специфікація взагалі щось змінила.

👉 **Повні інструкції — [`docs/walkthrough.md`](docs/walkthrough.md)**

## Швидкий старт

```bash
gh repo fork koldovsky/2026-udc-07-sdd-bmad-hw --clone
cd 2026-udc-07-sdd-bmad-hw
git checkout -b ws07/<github-username>

cd app && npm install && npm test && cd ..
```

8 зелених тестів — це вже специфікована поведінка. Рушія знижок немає: його ви
й будуєте.

## ⚠️ Передумови — поставте ДО початку

| Інструмент | Рантайм | Встановлення |
|---|---|---|
| **OpenSpec** | Node | `npm install -g @fission-ai/openspec@latest` |
| **Spec Kit** | Python + `uv` | `uv tool install specify-cli` |
| **BMAD Method** | Node + `uv` | `npx bmad-method install` |

Для цього TypeScript-репо найдешевший старт — **OpenSpec** (Node CLI).
Spec Kit і BMAD обидва потребують `uv`.

## Що вже є

| Шлях | Що це |
|---|---|
| `app/src/types.ts` | `Order`, `LineItem`, `Coupon` — стабільний контракт, суми в копійках |
| `app/src/pricing.ts` | `subtotalCents`, `shippingCents`, `tierPercent` — **не змінювати** |
| `materials/feature-request.md` | Навмисно неоднозначний тікет — **не редагувати** |
| `docs/templates/` | `spec-template.md`, `traceability.md`, `ab-validation.md`, `task-e-bonus.md` |

## Що створюєте ви

- `docs/spec/pricing-discounts.md` — специфікація (Task A)
- артефакти SDD-інструмента + `docs/sdd-tool.md` (Task B)
- рушій знижок + тести за ID критеріїв + `docs/traceability.md` (Task C)
- `docs/ab-validation.md` (Task D)
- `docs/task-e-bonus.md` (бонус, Task E)
