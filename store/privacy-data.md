# Privacy and Data-Safety Answers

This file is the source of truth for App Store privacy labels and Google Play Data safety. Reconcile it against production telemetry and provider contracts immediately before submission.

## Collected and linked to the user

| Data | Why | Shared processor | Tracking or sale |
|---|---|---|---|
| Email address | Account, recovery, support; marketing only after separate opt-in | Resend; Mailchimp only after opt-in | No |
| Internal user ID | Account, device linking, sync, entitlements, deletion | Hosting/database providers | No |
| Random install/device ID | Authentication, linking, free-study abuse prevention | Hosting/database providers | No |
| Keyed one-way hash of registration request IP address (raw IP is not stored; retained for no more than 48 hours) | Registration abuse and fraud prevention | Hosting/database providers | No |
| Purchase history and entitlement | Verify and restore subscriptions | Apple, Google, Stripe, backend | No |
| Passage searches and references | Load text, create studies, preserve history | Bible-text provider; Anthropic for generated studies | No |
| Questions, notes, saved studies, and manuscript workspace | Answer requests and sync user work | Anthropic only for content deliberately submitted to a generated request; hosting/database for synced work | No |
| Product interactions and usage counts | Entitlements, allowances, reliability, cost controls | Hosting/database providers | No |
| Limited technical error information | Security, reliability, support | Hosting provider | No |

## Not collected by BASE1520

- Full payment-card number.
- Contacts, precise location, health data, photos, or advertising identifiers.
- Sermon audio merely because it was recorded. Audio stays on the device until the user explicitly shares it.
- Cross-app or cross-company tracking data.

## Apple App Privacy

Declare these as linked to the user, not used for tracking:

- Contact Info → Email Address: App Functionality; Developer's Advertising or Marketing only for separately opted-in users.
- Identifiers → User ID and Device ID: App Functionality.
- Identifiers → Device ID: App Functionality for the keyed registration-request IP hash, retained for no more than 48 hours and not used for tracking.
- Purchases → Purchase History: App Functionality.
- User Content → Other User Content: App Functionality.
- Search History: App Functionality.
- Usage Data → Product Interaction: App Functionality.
- Diagnostics → Other Diagnostic Data only if production logs retain user-linked technical errors. If logs are provably unlinked and promptly discarded, document that evidence before omitting it.

No data is used for tracking. Do not list Audio Data while recordings remain local-only.

## Google Play Data safety

- Data encrypted in transit: Yes.
- User can request deletion: Yes, in app and at the public deletion URL.
- Account creation: Yes.
- Data collection required: account identity, identifiers, study requests, purchases when applicable, and service usage required to provide the requested service.
- Optional data: marketing email consent.
- Device or other IDs: a keyed one-way hash of the registration request IP address, never the raw address, retained for no more than 48 hours for fraud prevention.
- Data sharing: disclose service-provider processing exactly as Google defines it at submission time. Anthropic processes data needed for generated studies; Resend handles recovery email; Mailchimp receives email only after opt-in; Apple, Google, and Stripe process purchases.
- Security practices: no broad Android permissions; no advertising SDK; backups disabled; secrets stored in Keychain/Keystore; TLS required.

## Permission copy

Microphone: `The Operator records your sermon or rehearsal when you tap Record. Recordings stay on this device until you share or delete them.`

AI processing: `To build a study, The Operator sends the Scripture reference, Bible text, and the content needed for your request to Anthropic's API. Ask and specialist-agent questions also send your question and recent conversation. Your manuscript and local sermon recordings are not sent merely because they are in the workspace.`
