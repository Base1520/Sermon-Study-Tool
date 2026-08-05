/**
 * endpoint.js — where a packaged build talks to.
 *
 * WHY THIS IS A FILE AND NOT AN ENVIRONMENT VARIABLE. A double-clicked .app
 * inherits no shell environment. process.env.OPERATOR_API_URL is set when Cole
 * runs `npm run dev` from a terminal and is empty for every single person who
 * downloads the DMG — so a build that relied on it would silently fall back to
 * demanding an Anthropic key, which is the exact wall the server exists to
 * remove, and it would only show up on someone else's machine.
 *
 * The URL is not a secret. It is a public API endpoint that anyone can see in a
 * network trace; the key it protects lives on the server and never ships.
 *
 * PRECEDENCE, deliberately in this order:
 *   1. process.env.OPERATOR_API_URL — set it to point a dev build at localhost
 *   2. this constant — what every packaged build uses
 *   3. OPERATOR_API_URL='' (explicitly empty) — turn hosting OFF and go back to
 *      the local-key path, which is the escape hatch if the server is ever down
 *      and someone with their own key needs to keep working
 */
const DEFAULT_API_URL = 'https://api-production-15e5e.up.railway.app'

module.exports = { DEFAULT_API_URL }
