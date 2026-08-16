# App Review Notes

> Submission hold: do not paste these notes into either console until `npm run mobile:store:check:live` passes and the exact reviewer path below has been repeated from a store-distributed build.

## Reviewer path

1. Open the app and complete the short introduction.
2. Choose **I ALREADY HAVE AN ACCOUNT**, then open **LINK EXISTING ACCOUNT**.
3. Enter the private one-time `OPR-…` device-link code supplied in this store's private reviewer-access field and choose **CONNECT THIS DEVICE**. No inbox, password, card, or API key is required.
4. Enter a passage such as `Romans 8:1-4` and run the included study.
5. On a phone, the app opens Quick Study. On a tablet, it opens Guided Study and exposes the PLAIN/SERMON switch.
6. Open Account to review plans, Restore Purchases, native subscription management, privacy links, account deletion, and linked-device controls.

Before submission, prepare one dedicated empty Operator reviewer account and add its exact email to `IAP_SANDBOX_ACCOUNT_EMAILS`. Separately configure and use the appropriate Apple/Google sandbox or test purchaser identity. Do not assume or require those identities to use the same email; verify each identity in its own system. Put one unused device-link code and these steps only in that store's private reviewer-access field—not in this repository. Retain the remaining one-time codes privately as replacements if review changes devices. Rehearse link, study, purchase, restore, and deletion from the store-distributed build, and keep the account usable for the entire review window.

## Artificial-intelligence processing

Before the first generated study, the app explains that the Scripture reference, Bible text, and content needed for the request are sent to Anthropic's API and asks for explicit permission. Ask and specialist-agent questions disclose the additional question and recent conversation sent for that request. A user can withdraw the study-processing permission from Account.

Generated output can be incomplete or wrong. The app consistently tells users to verify conclusions against Scripture and reliable sources.

## Microphone and local recordings

The microphone is used only on tablet when the user taps Record inside the SERMON workspace. Recordings are stored locally on that device. They are not uploaded by default and leave the app only when the user deliberately opens the system share sheet.

## Bible translations

The initial store build includes public-domain translations only. ESV is not exposed in the store build. No reviewer API key is needed.

## Purchases

- One complete study is included after free email verification and without purchase.
- Digital subscriptions are purchased through StoreKit on Apple devices and Google Play Billing on Android devices.
- Prices are loaded from the store, not hard-coded into the purchase confirmation.
- Restore Purchases and Manage Subscription are in Account.
- Annual plans renew annually while study allowances reset monthly.
- Deleting an Operator account warns that Apple or Google billing must be canceled separately.

## Account deletion

Account → Delete Account permanently removes the Operator account, synced studies, notes, device links, and readable email record. The public deletion path is `https://www.base1520.com/operator/account-deletion/`.

## Support

- Support: `https://www.base1520.com/contact/`
- Privacy: `https://www.base1520.com/operator/privacy/`
- Terms: `https://www.base1520.com/operator/terms/`
- Contact: `info@base1520.com`
