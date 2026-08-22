# Store Products

> PRICE LOCK — updated 2026-08-22: Starter is `$29.99 / $299.99`, Standard is `$49.99 / $499.99`, and Heavy is `$149.99` monthly on iOS **and Google Play**. Heavy Annual (`$1,649.99`) is **web-only**: Apple's subscription ceiling cannot represent it profitably, and Google Play's hard price cap is `$999.99` USD (£810 / €940 / ₩600,000 — every currency rejected it on 2026-08-22). Cole ruled 2026-08-22: Heavy Annual is purchased on desktop/web only, never in the mobile apps.

## Shared rules

- Product: The Operator access, one person per subscription.
- Free tier: one complete study; no card required.
- Monthly allowances reset each month and unused studies do not roll over.
- Annual plans charge once for the year but keep the same monthly allowance.
- Existing completed studies remain available after cancellation.
- Subscription access must restore across devices attached to the same Operator account.

## Apple App Store

Use one subscription group named `The Operator Access` with five purchasable auto-renewable subscriptions. The existing Heavy Annual record remains unavailable and is excluded from the iOS catalog.

| Plan | Product ID | Period | Price | Monthly allowance |
|---|---|---:|---:|---:|
| Starter Monthly | `com.base1520.theoperator.starter.monthly` | 1 month | $29.99 | 40 |
| Starter Annual | `com.base1520.theoperator.starter.annual` | 1 year | $299.99 | 40 |
| Standard Monthly | `com.base1520.theoperator.standard.monthly` | 1 month | $49.99 | 80 |
| Standard Annual | `com.base1520.theoperator.standard.annual` | 1 year | $499.99 | 80 |
| Heavy Monthly | `com.base1520.theoperator.heavy.monthly` | 1 month | $149.99 | 300 |

Subscription group display name: `The Operator Access`.

Each product description should state its monthly study allowance and renewal period. Submit the first subscription with the first app version. Add an App Review screenshot showing the plan picker, renewal disclosure, Terms, Privacy, Restore Purchases, and Manage Subscription controls.

## Google Play

Create one subscription product named `The Operator Access` with product ID `com.base1520.theoperator.subscription`. Add **five** auto-renewing base plans (created and Active 2026-08-22; `standard-annual` excludes South Korea because Play caps KRW at ₩600,000):

| Base plan ID | Period | Price | Monthly allowance |
|---|---:|---:|---:|
| `starter-monthly` | P1M | $29.99 | 40 |
| `starter-annual` | P1Y | $299.99 | 40 |
| `standard-monthly` | P1M | $49.99 | 80 |
| `standard-annual` | P1Y | $499.99 | 80 |
| `heavy-monthly` | P1M | $149.99 | 300 |
| ~~`heavy-annual`~~ | P1Y | ~~$1,649.99~~ | 300 | **NOT on Play** — Play's USD cap is $999.99; web-only (identifier kept in `iap-products.json` for defensive recognition) |

Use the same benefits copy and pricing across each platform's purchasable catalog, app UI, website, and receipt-verification service. The deliberate platform exception is Heavy Annual: **web only** at `$1,649.99`; neither iOS nor Android may request or render it (`catalogForPlatform` excludes it for both since 2026-08-22). Keep its identifier in `server/src/iap-products.json` for web/Stripe and defensive receipt recognition. Do not create legacy in-app products for digital access.

## Before product creation

1. Confirm the Apple bundle and Google package records are owned by BASE1520.
2. Confirm tax, banking, and paid-app agreements are active in both consoles.
3. Create sandbox/license tester accounts.
4. Enter provider credentials only in the secure backend environment.
