# Store Products

> PRICE LOCK — 2026-08-09: Cole approved the current six-plan grid: `$30 / $300`, `$50 / $500`, and `$150 / $1,650`, with monthly allowances of 40, 80, and 300 studies. Product creation remains a separate external action requiring Cole's approval when it occurs.

## Shared rules

- Product: The Operator access, one person per subscription.
- Free tier: one complete study; no card required.
- Monthly allowances reset each month and unused studies do not roll over.
- Annual plans charge once for the year but keep the same monthly allowance.
- Existing completed studies remain available after cancellation.
- Subscription access must restore across devices attached to the same Operator account.

## Apple App Store

Use one subscription group named `The Operator Access` with six auto-renewable subscriptions.

| Plan | Product ID | Period | Price | Monthly allowance |
|---|---|---:|---:|---:|
| Starter Monthly | `com.base1520.theoperator.starter.monthly` | 1 month | $30 | 40 |
| Starter Annual | `com.base1520.theoperator.starter.annual` | 1 year | $300 | 40 |
| Standard Monthly | `com.base1520.theoperator.standard.monthly` | 1 month | $50 | 80 |
| Standard Annual | `com.base1520.theoperator.standard.annual` | 1 year | $500 | 80 |
| Heavy Monthly | `com.base1520.theoperator.heavy.monthly` | 1 month | $150 | 300 |
| Heavy Annual | `com.base1520.theoperator.heavy.annual` | 1 year | $1,650 | 300 |

Subscription group display name: `The Operator Access`.

Each product description should state its monthly study allowance and renewal period. Submit the first subscription with the first app version. Add an App Review screenshot showing the plan picker, renewal disclosure, Terms, Privacy, Restore Purchases, and Manage Subscription controls.

## Google Play

Create one subscription product named `The Operator Access` with product ID `com.base1520.theoperator.subscription`. Add six auto-renewing base plans:

| Base plan ID | Period | Price | Monthly allowance |
|---|---:|---:|---:|
| `starter-monthly` | P1M | $30 | 40 |
| `starter-annual` | P1Y | $300 | 40 |
| `standard-monthly` | P1M | $50 | 80 |
| `standard-annual` | P1Y | $500 | 80 |
| `heavy-monthly` | P1M | $150 | 300 |
| `heavy-annual` | P1Y | $1,650 | 300 |

Use the same benefits copy and pricing in the store console, app UI, website, receipt-verification service, and `server/src/iap-products.json`. Do not create legacy in-app products for digital access.

## Before product creation

1. Confirm the Apple bundle and Google package records are owned by BASE1520.
2. Confirm tax, banking, and paid-app agreements are active in both consoles.
3. Create sandbox/license tester accounts.
4. Enter provider credentials only in the secure backend environment.
