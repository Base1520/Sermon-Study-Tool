# The Operator — where this stands

_Session ended 2026-08-05 on a usage limit. This is the resume point._

## What works, proven against the live server

- **Server**: `https://api-production-15e5e.up.railway.app` — healthy.
- **Full study, no user API key**: analyze → read → ask, all on the server's key.
  Verified live: 39 sections streamed with content, a 20,021-char document,
  billed **one** study not two.
- **Comp codes** (rotated — the originals leaked into the public repo and are
  revoked):
  - Cole — `OP-NY7S-V4JH-2EUQ`
  - Rikki — `OP-RU4B-SQGG-2HNR`
  - Beta (25 uses) — `OP-KUDB-QJ5V-7667`
  Live-tested: redeem → `plan=comp`, 500 studies/mo, authenticated.
- **Release gate**: `npm run test:release` — 362 assertions, green.
- **Packaging**: `npm run build:mac` completes.

## Deploying

GitHub → Railway auto-deploy is dead (five pushes never triggered). Deploy from
local instead — Cole is logged into the CLI:

```
railway up --service a82ee584-c3ce-49a1-8d72-670c8a659928 --detach
```

**The last server change (commit ed493e0) is committed but NOT yet deployed.**

## NEXT STEP

1. `railway up …` (above), wait for `/v1/redeem` to answer.
2. Work the remaining findings below.
3. `npm run test:release`, then `npm run publish` to build + notarise + release.
4. Send Cole and Rikki the DMG link and their codes.

Notarisation is already configured: Developer ID *Base 1520 LLC (6UP72M96Q5)*,
keychain item `operator-notarize`.

## Three audit rounds — what was found

103 confirmed defects across three rounds, each attacked by independent
verifiers. The ones that mattered most:

- The app was **dead on arrival** — the renderer gated every study on a local
  API key a hosted build never has, so all the hosted code was unreachable.
- **Nobody could have paid** — Electron strips custom Error properties across
  IPC, so every paywall rendered as a red error box with no buttons.
- **A paid subscription could be lost forever** — and retrying made it permanent.
- **The upgrade button double-billed** — $80/mo, invisible in the app.
- **Stripe webhooks could never verify** — a failed card stayed `active` and kept
  spending.
- **Comp codes were committed to a public repo**, two of them unlimited-use.

## Still open (from round 3)

### [MEDIUM] src/App.tsx:258
**Opening the app silently spends a study — the reader auto-runs on launch and any local-cache miss goes to the paid server**

This effect fires on every change of `analysis`, and App.tsx:463 restores the last history entry on launch — so simply opening the app re-runs the last reading with no user action. main.js:990 will only serve the local copy when verification.status === 'ok'. A verify call that 529s or times out leaves the document marked 'failed' (pipeline.js:1202), which is refused by BOTH cache writes (main.js:1037 and pipeline.js:1249), so that passage is never cached anywhere. Result: every launch re-charges. On a subscription that is one of 40 studies burned per app launch, forever, for that passage; on a free install it is the one lifetime credit spent before the user has clicked anything, and the next

_Fix:_ Do not generate on launch: make the restored-session path render only what is cached and require an explicit press to spend a study (pass a flag from sessionLoadLatest, or gate the effect on a cache probe). Independently, cache the document locally regardless of verification status and re-verify on read, or record the failed-verify key so a re-open is at least free. If the key change stands, migra

### [MEDIUM] src/components/HostedAccount.tsx:230
**A globally paused service is rendered as a sales paywall — a man can pay $30 during an outage and still get nothing**

When committed spend passes 150% of the ceiling, claimStudy returns 503 SERVICE_PAUSED (index.js:120). client.js:131 throws that as a HostedRefusal, main.js tags it, and App.tsx:295 shows it in the HostedAccount overlay. That payload carries no `headline` and no `actions`, so line 186 falls back to the anonymous default and the panel is titled "One free study, on the house" while the body says the service is paused; and this line's `(me && !me.paying)` branch fills the panel with live Starter/Standard/Heavy buttons. An anonymous user therefore sees a subscribe offer at the exact moment nothing can run. He buys Starter, claims his token, presses SEND IT, and gets 503 again — blockEverything s

_Fix:_ Branch on offer.code: for SERVICE_PAUSED (and any offer with no actions) suppress the plan buttons and the anonymous headline fallback, and show the server's message alone. Give SERVICE_PAUSED and FREE_TIER_PAUSED explicit headlines server-side so the panel never has to guess.

### [MEDIUM] server/src/migrate.js:69
**Revoking the leaked comp codes does not revoke the accounts and device tokens already minted from them**

OPERATOR-COLE / OPERATOR-RIKKI / OPERATOR-BETA were committed to a public repo and two were unlimited-use. This UPDATE sets revoked_at on the CODE, which only blocks future redemptions. Anyone who redeemed one before the revoke already holds an account row (plan='comp', status='active', 500 studies/month) and a device token whose hash is in `device` — auth.identify (auth.js:50) never consults access_code, so that token keeps working forever. One stranger who read the repo is a standing 500-study-per-month draw on Cole's Anthropic key, invisible in Stripe and unaffected by this migration.

_Fix:_ In the same statement block, revoke downstream: UPDATE device SET revoked_at=now() WHERE account_id IN (SELECT account_id FROM access_code_use WHERE code = ANY(BURNED)), and set those accounts to plan='free', status='canceled'. Then check whether any rows exist before shipping.

### [MEDIUM] src/components/CrossRefArcs.tsx:82
**The LINKS tile prints the raw Electron IPC error string at the user**

On a hosted build the LINKS tile is listed because `apiKey` is truthy (PlainRead.tsx:794) — secretStatus() deliberately reports ANTHROPIC_KEY=true on a hosted build (main.js:232-238), so the gate that was meant to hide key-dependent tools is permanently open on the only build real users download. Clicking LINKS calls get-cross-refs, which hits requireSecret at main.js:1617 and throws NEEDS_OWN_KEY. The catch does `setError(e?.message ?? ...)` with no friendlyApiError, so the panel renders, centred, in 8px mono: "⚠ Error invoking remote method 'get-cross-refs': Error: This tool is not on our servers yet — it still needs your own Anthropic key. Studying a passage, reading it, and asking about 

_Fix:_ Route through friendlyApiError like every other surface, and gate the tile on a real hosted/own-key flag rather than on `apiKey`, which is a lie by construction on a hosted build.

### [MEDIUM] server/src/index.js:324
**After a stranded reading, the free user's one lifetime credit is consumed permanently on the very next attempt with no refund**

Anonymous user, one lifetime study. /v1/analyze spends it and returns studyId S. /v1/read rides S and fails four times (engine.js:290-297), so the claim goes 'stranded' and index.js:315-317 correctly refunds the anon credit. The client never calls forgetStudy on failure, so recallStudy still returns S. He presses TRY AGAIN. claimStudyForReading(S) now fails because state is 'stranded', so index.js:284 takes a fresh claim and anon_install.studies_used goes back to 1. That generation fails too. release() runs, releaseStudyForRetry returns 'analyzed' (not 'stranded'), and line 324's `!accountId` short-circuits before any refund — the anon branch only exists inside the stranded block. The credit

_Fix:_ Move the anonymous refund out of the stranded-only block: whenever the reading failed and the claim was NOT a ride-along, hand back the anon credit the same way the account reservation is handed back. Alternatively return the fresh studyId in the error frame so the client can ride it.

### [MEDIUM] src/components/HostedAccount.tsx:186
**A paused service is announced under the headline "One free study, on the house" with subscribe buttons**

When the global ceiling trips (meter.js:257 blockEverything), claimStudy returns the SERVICE_PAUSED body at index.js:121-124 — it carries `message` but no `headline` and no `actions`. hostedError decodes it fine, so App shows the HostedAccount overlay. Line 186 falls back to `me?.anonymous ? 'One free study, on the house'`, and because `me && !me.paying` the SUBSCRIBE block at line 230 also renders with real Starter/Standard buttons. So at the exact moment the server will run nothing for anybody, an anonymous user is told he has a free study waiting and is invited to pay $30/mo for a service that is switched off. If he buys, Stripe takes the money and his first study still refuses.

_Fix:_ Give SERVICE_PAUSED a headline in entitlement/index.js, and in HostedAccount suppress the plan buttons whenever the offer's code is SERVICE_PAUSED or FREE_TIER_PAUSED — the fallback headline must never apply to an offer that carried its own refusal.

### [MEDIUM] server/src/index.js:200
**A free, token-free 413 permanently unlocks /v1/ask for any install id, and the credit is refunded too**

engine.openStudy writes the `study` row BEFORE the try block, and the anonymous catch at line 227-229 refunds the credit unconditionally with no retry counter. POST /v1/analyze with reference='John 3:16' and text of 12,001 characters: claimStudy takes the lifetime credit, openStudy writes a study row carrying this install_id, then runAnalyze -> analyzePassage -> checkGenerationInput throws InputTooLarge (electron/plainread/runtime.js:106, LIMITS.passageChars=12000) before a single token is spent, the catch hands the credit back, and 413 is returned. Net cost to the caller: nothing. Net result: this install_id now satisfies the anonymous ask gate at line 425-427 (`SELECT 1 FROM study WHERE in

_Fix:_ Run checkGenerationInput({text, reference}) at the route, before claimStudy and openStudy — /v1/read already validates its input size before claiming. Alternatively DELETE the study row in the analyze catch when nothing was spent.

### [MEDIUM] server/src/meter.js:224
**The global ceiling is blind to every in-flight FREE study — no anonymous work ever holds a reservation**

claimStudy's anonymous branch (index.js:141-158) writes only anon_install; it never creates a usage_period row, so no reserved_usd is ever held for free work. committedSpend takes its entire in-flight component from `SELECT SUM(reserved_usd) FROM usage_period`, so N concurrent anonymous studies contribute exactly $0 to `committed` for the ~163 seconds each one runs, and only become visible once their usage_event rows land at the end. This violates meter.js's own Rule 3 ('IN-FLIGHT WORK IS COMMITTED MONEY ... a ceiling that sums only COMPLETED spend reads zero for everything currently running — which is precisely when a burst is happening') on the one tier that requires no account at all. Lau

_Fix:_ Hold a reservation for anonymous work too — either write a usage_period-shaped row keyed on install_id, or add an in_flight table that both claimStudy branches insert into and both settle paths delete from, and sum that in committedSpend.

### [MEDIUM] src/components/HostedAccount.tsx:109
**Offline, the whole account panel disappears — no access-code field, no plan buttons**

On mount, `hostedMe()` returns null when offline (client.js `me()` catches and returns null on purpose), so `!state` is true and line 109 calls `hostedClaim()`. Unlike `me()`, `claim()` (electron/hosted/client.js:365) has no try/catch around its `fetch`, and `ipcMain.handle('hosted-claim')` (main.js:607) does not wrap it either — so with no network the bare `fetch` rejects with TypeError, the rejection crosses IPC, and the outer `catch { if (alive) setEnabled(false) }` on line 116 fires. `enabled === false` makes the component return null (line 177). On a hosted build the Anthropic key field is `display:none` (ApiKeyModal.tsx:186) and HostedAccount is the only thing in its place, so a tester

_Fix:_ Wrap the claim call in its own try/catch so a network failure cannot reach the `setEnabled(false)` handler, or make `claim()` degrade like `me()` does — return `{ ok: false }` on a fetch rejection instead of throwing. Reserve `setEnabled(false)` for the one thing it actually means: `hostedEnabled()` returning false.

### [LOW] src/components/HostedAccount.tsx:108
**claim() on mount never runs at launch — HostedAccount is only mounted inside Settings or the paywall**

The round-2 fix is written so "a restart is now the fix rather than the trap," but this component is rendered in exactly two places: the upgrade overlay (App.tsx:1179) and the settings modal (ApiKeyModal.tsx:181). On a hosted build secretStatus() reports ANTHROPIC_KEY true (main.js:232), so showKeyModal is false on launch and neither one mounts. A buyer who quits the app during checkout — the precise case the commit message names — reopens to an app that is still anonymous and never asks. He only recovers by hitting the paywall again (which does mount the overlay and does claim), i.e. after wasting another study attempt; and if his free lifetime study is still unspent, that attempt is charge

_Fix:_ Call hostedClaim() once at app start when hostedEnabled() and hostedMe() reports anonymous — a small effect in App.tsx, independent of any panel being open. Also give the effect stable deps: `onChanged` is an inline arrow from App, so this effect currently re-runs (and re-claims) on every parent render.

### [LOW] src/components/PassageInput.tsx:73
**A mistyped reference shows the raw Electron IPC string on the first step of the walk**

handleFetch's catch does `setFetchError(e?.message ?? 'Could not fetch passage')` and the value is rendered verbatim in a red box in the sidebar (PassageInput.tsx:231-241). Type anything bible-api.com cannot parse — "Jn 3:16", "2Cor 5", "Romans 8:1-4a" — and main.js:1751 throws, producing: "⚠ Error invoking remote method 'fetch-bible': Error: Bible API error: 404 Not Found". Select ESV with no ESV key and it reads "⚠ Error invoking remote method 'fetch-bible': Error: ESV API key required — add it in Settings." This is the very first thing a beta tester does. The same untreated `e?.message` is rendered per-column by the VERSIONS tile (ParallelPanel.tsx:61), which is on the reader rail.

_Fix:_ Use friendlyApiErrorText here and in ParallelPanel, and add a branch for a 404 from bible-api.com that says the reference could not be found and suggests the canonical spelling, rather than surfacing the transport.

### [LOW] src/components/ApiKeyModal.tsx:395
**Demo mode is unreachable on a hosted build — the only zero-cost way to see the product before spending the one free study**

The EXPLORE DEMO — ROMANS 8 button is gated on `!hasExistingKey`. On a hosted build secretStatus() reports ANTHROPIC_KEY=true (main.js:232-238), App sets apiKey to STORED_KEY (App.tsx:443), and hasExistingKey is therefore always true. The button never renders on the build every beta tester will download. The demo data is fully local (data/demoAnalysis.ts, no network, no key), and App's demo handler is wired and correct — it is simply unreachable. A hosted user's only way to see a finished reading is to spend his single lifetime credit.

_Fix:_ Gate the demo button on `!hasExistingKey || hostedBuild` (or drop the gate entirely — the demo costs nothing on any build).

### [LOW] server/src/index.js:316
**The 'stranded' refund lets an anonymous caller reset their lifetime credit for free, without limit**

/v1/read validates the size of `analysis` at the route but never the length of `reference`; that check happens inside engine.runPlainRead (engine.js:113 -> checkGenerationInput -> runtime.js:106, LIMITS.referenceChars=120), AFTER claimStudyForReading has already taken the claim and the response has started streaming. So: run one free /v1/analyze to get studyId S (credit spent, used=1). Then POST /v1/read four times with {analysis:{a:1}, reference:'x'.repeat(200), studyId:S}. Each call claims S ('analyzed'->'reading'), throws InputTooLarge before any model call, and hits release(); releaseStudyForRetry (engine.js:290-298) walks retries 0->1->2->3 and on the fourth returns 'stranded', at which

_Fix:_ Validate reference length at the route, before claimStudyForReading/claimStudy. And refund a stranded claim only when engine.studyCost(studyId) shows the claim actually bought nothing — a claim that burned four generations should not also be free.

### [LOW] server/src/index.js:313
**The stranded refund releases a $0.75 reservation a ride-along no longer holds, silently eating another in-flight study's hold**

On the stranded path, index.js:313 calls meter.releaseStudy unconditionally — including when ridesPriorClaim is true. On a ride-along, /v1/analyze already released that $0.75 hold via settleStudy (meter.js:117). releaseStudy's `reserved_usd = GREATEST(reserved_usd - 0.75, 0)` therefore decrements a hold that is not held, and if the same account has another study in flight it consumes THAT study's live reservation instead. This is precisely the hazard recordAdditionalSpend's own header (meter.js:126-134) was written to avoid — 'clamped at zero it silently eats some other request's in-flight money, which makes the global ceiling read low at exactly the moment a burst is happening' — reintroduc

_Fix:_ On the stranded path, when ridesPriorClaim is true decrement studies_used only; call the full releaseStudy only for a claim whose reservation is still open.


## Clint Riggin's beta feedback — done

He wanted to copy output into his own documents. Two things blocked it, both
fixed: the app had `user-select: none` on `<body>` with only three opt-ins, and
Electron gives a window no context menu at all, so right-click did nothing.

Older feedback is unrecoverable — the Supabase project behind it no longer
exists (NXDOMAIN). Feedback now lives on the Operator API and is reachable at
`GET /v1/feedback` with a comp account.

## Known gaps, deliberately not pretended away

- **Eleven deeper tools still need the user's own Anthropic key** — word study,
  cross-references, the scholar panel, sermon drafting, group guide. The core
  loop (study, read, ask) is hosted. The rest now says so honestly instead of
  sending people to a Settings panel with no key field.
- **The beta feedback panel has no entry point in the UI** (round 3 finding) —
  testers cannot file a report until that is mounted.
