// TEMPLATE ONLY — the real file is electron/embedded-key.js and is GITIGNORED.
//
// WHY THIS EXISTS
// Seven men asked for this tool, were handed free API keys, and two of them
// downloaded it. Zero studies were run. The app was not the problem; the SETUP
// was. "Create an Anthropic account, add billing, generate a key, copy it out of
// an email, paste it into a field" is four steps too many for a pastor who was
// curious on a Tuesday.
//
// A beta build carries a key so the whole flow becomes: download, open, study.
//
// HOW IT IS FILLED
// Never by hand, never committed. scripts/build-beta.sh writes it from an
// environment variable at build time and deletes it afterwards. If this file is
// absent — which it is in every normal build and in the repo — the app behaves
// exactly as it always has and asks the user for a key.
//
// WHAT THIS IS AND IS NOT
// The key IS extractable from the shipped .app by anyone who knows how to open
// an asar. That is unavoidable in a desktop application and pretending otherwise
// would be a lie. It is acceptable here for the same reason the licence check is
// acceptable: this is a checkout counter, not a lock. What makes it safe is not
// secrecy, it is the blast radius —
//
//   * a DEDICATED key, used for nothing else, in its own Anthropic workspace
//   * a HARD workspace spend cap, set low, so the worst case is a known number
//   * revocable in one click without touching any other key
//   * short-lived: this is a beta, not the shipping product
//
// Do NOT put a personal or production key here.

module.exports = {
  ANTHROPIC_KEY: '',
}
