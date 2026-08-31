# Вихід експерименту Task E — ланцюг ролей BMAD

Цей каталог — **результат вимірювання, а не специфікація репозиторію**.

Ланцюг ролей BMAD (Analyst → PM → Architect → Dev) прогнано на сирому тікеті
`materials/feature-request.md`, без доступу до `docs/spec/pricing-discounts.md`.
Питання експерименту: які розвилки ланцюг ролей закриє сам і чи вартує це
накладних витрат. Розбір і числа — у `docs/task-e-bonus.md`.

## Що тут лежить

| Шлях | Що це |
|---|---|
| `planning-artifacts/briefs/` | бриф Analyst і його рецензія |
| `planning-artifacts/prds/` | PRD і addendum PM |
| `planning-artifacts/epics.md` | епіки й історії PM |
| `planning-artifacts/architecture/` | spine Architect і два файли рецензій |
| `implementation-artifacts/` | реалізація і тести, які написав Dev ланцюга |
| `*/.memlog.md` | внутрішні журнали рішень ролей |

## Чому це не узгоджено з `docs/spec/pricing-discounts.md`

Бо в цьому й полягав вимір. Ланцюг приймав рішення самостійно і на п'яти
розвилках із дванадцяти обрав інше, ніж наша специфікація:

| Розвилка | Ланцюг ролей | `docs/spec/pricing-discounts.md` |
|---|---|---|
| кілька промокодів (D-3) | застосовує всі послідовно | рівно один найвигідніший |
| округлення (D-4) | round-half-up | `Math.floor` на кожній знижці |
| дані купона поза контрактом (D-17) | явно віднесено до upstream | причина `invalid` перед перевіркою терміну |
| API рушія | `applyDiscounts(order, coupons, asOf)` | `priceOrder(order, catalog, now?)` |
| зіставлення коду | trim + lowercase | точне, з регістром і пробілами |

Артефакти залишені **дослівно, як їх видали ролі**, включно з внутрішніми
неузгодженостями між ними: у брифі одночасно живуть «усі коди» і «один
найвигідніший», у журналі PRD бракує причини `no_matching_items`, у addendum
використано `category_mismatch` замість фінального enum. Саме ці розходження й
досліджує `docs/task-e-bonus.md` — правка тут стерла б предмет вимірювання.

## Що є робочим кодом

Реалізація репозиторію — `app/src/discounts.ts` за
`docs/spec/pricing-discounts.md`; простежуваність — `docs/traceability.md`.
Нічого з цього каталогу не імпортується застосунком і не бере участі в
`npm test`.
