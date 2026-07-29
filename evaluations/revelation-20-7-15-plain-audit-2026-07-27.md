# Revelation 20:7-15 PLAIN Audit

Date: 2026-07-27  
Scope: PLAIN reader only. The sermon workspace, manuscript generator, and pulpit-side content were not part of this pass.

## Result

The PLAIN interface implementation passes its focused regression suite and production build. The last live version-8 reading rendered successfully, but it did **not** pass theological content review. Version 9 now rejects every reader-visible failure found in that cached document and carries stronger generation and verification instructions.

A fresh version-9 document could not be generated because the Anthropic API account ran out of credits after the live audit runs. Therefore:

- PLAIN interface and interaction benchmark: **pass**
- Deterministic Revelation guardrail benchmark: **pass**
- Cached version-8 document under version-9 validation: **fail as intended**
- Fresh version-9 model-output benchmark: **pending API credits**

Do not call the Revelation 20:7-15 content benchmark fully passed until a fresh version-9 reading generates and survives review.

## PLAIN Interface Changes

- Scripture is divided by the text's natural units and retains visible verse numbers.
- Every Scripture word is an accessible study control that opens the existing original-language drawer with its full verse as context.
- Section headings and “The shape of the text” use larger, higher-contrast BASE styling.
- The PLAIN study rail includes a GUIDE action that opens the COVENANT small-group guide.
- CULTURE is visibly labeled provisional rather than presented as settled source material.

Headless rendering against the real cached Revelation passage produced:

- 265 Scripture-word study buttons
- 9 visible verse numbers
- 2 natural passage-unit panels
- the “Why the text is divided here” explainer

## Live Content Failures Found

The rendered version-8 reading contained ten reader-visible claims now rejected by version 9:

1. It expanded “the dead, great and small” into “every person” or “everyone who ever died.”
2. It made Satan, rather than the gathered nations, the one consumed by fire in verse 9.
3. It claimed deeds are merely evidence while the book of life decides or overrides the outcome.
4. It claimed the original readers knew one exact imperial referent for the beast and false prophet.
5. It said Gog and Magog had become shorthand for every enemy of God by John's time.
6. It repeated participant overclaims in the setting, surroundings, doing, and restraint blocks.

The new validator rejects the cached version-8 document immediately. A full sentence-level pass found all ten user-facing occurrences plus six duplicates preserved only in the internal verification ledger.

## Guardrails Added

- Revelation's seven churches must remain a mixed audience: faithful, afflicted, compromised, complacent, and self-deceived.
- A failed mixed-audience correction receives one surgical model retry; if that retry repeats only this known error, code replaces the bad sentence with a narrow, accurate mixed-audience statement.
- Gog and Magog may be traced to Ezekiel 38-39, but the document may not turn them into Russia, a modern nation, every enemy everywhere, or an unsupported first-century shorthand.
- Fire in verse 9 consumes the gathered nations; Satan is thrown into the lake of fire in verse 10.
- The throne scene retains John's wording, “the dead, great and small,” unless a broader participant claim is clearly qualified as interpretation.
- The relationship between deeds and the book of life remains unexplained by this paragraph; the tool may not import “deeds are evidence, the book decides” as neutral fact.
- Claims that every original hearer knew one exact beast/false-prophet referent are rejected.
- A labeled common-misreading field may name an error in order to correct it; the same sentence still fails in ordinary teaching fields.
- When code converts a sensitive passage from a plan into a question, it now completes that conversion with a non-coercive question instead of rejecting its own result.

## Small-Group Guide

The PLAIN GUIDE entry is wired to the existing COVENANT guide surface. Guide generation now:

- preserves exactly 10 questions in a 3 observation / 4 interpretation / 3 application sequence;
- preserves all eight COVENANT steps;
- separates participant questions from the leader answer key;
- refuses coercive personal disclosure;
- rejects presupposed disputed conclusions;
- rejects any Revelation guide that flattens the seven churches into one persecuted audience.

The group-guide suite passes 12/12.

## Verification

Passing suites:

- situation: 35/35
- outline: 24/24
- language levels: 53/53
- PLAIN voice: 20/20
- doctrine and Revelation guardrails: 15/15
- PLAIN pipeline and verifier: 25/25
- Ask the Operator: 45/45
- COVENANT group guide: 12/12

The Vite production build passes. Existing non-fatal warnings remain for unresolved Leaflet image URLs at build time and large chunks.

## Remaining Work

After Anthropic API credits are restored:

1. Generate Revelation 20:7-15 in PLAIN version 9.
2. Confirm the document passes without a refusal.
3. Re-read every statement about audience, Gog/Magog, vv. 9-10 subjects, throne participants, deeds/book of life, Hades, and chronology.
4. Click one word in the live passage and confirm the original-language drawer opens.
5. Open GUIDE from PLAIN and generate one live Revelation guide.

