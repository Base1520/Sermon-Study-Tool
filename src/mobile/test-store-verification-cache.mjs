import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  VERIFIED_TRANSACTION_TTL_MS,
  createVerifiedTransactionCache,
  verificationIdentity,
} from './storeVerificationCache.ts'

// A Google Play renewal keeps its purchase token and changes its order id.
const token = 'play-purchase-token-constant-for-the-subscription'
const firstPeriod = verificationIdentity({ transactionId: token, purchaseToken: token, orderId: 'GPA.3312-0000-0000-00000..0' }, 'android')
const renewal = verificationIdentity({ transactionId: token, purchaseToken: token, orderId: 'GPA.3312-0000-0000-00000..1' }, 'android')
assert.notEqual(firstPeriod, renewal, 'an Android renewal must not share a verification key with the period before it')
assert.equal(verificationIdentity({ transactionId: token, purchaseToken: token }, 'android'), token,
  'a purchase without an order id still has a stable key')
assert.equal(verificationIdentity({ transactionId: '2000000123', orderId: 'ignored' }, 'ios'), '2000000123',
  'StoreKit transaction ids already change per renewal')

let clock = 1_000_000
const cache = createVerifiedTransactionCache(VERIFIED_TRANSACTION_TTL_MS, () => clock)
assert.equal(cache.isFresh('never-seen'), false)
cache.remember('verified')
assert.equal(cache.isFresh('verified'), true, 'a burst of duplicate calls is still deduplicated')
clock += VERIFIED_TRANSACTION_TTL_MS - 1
assert.equal(cache.isFresh('verified'), true)
clock += 1
assert.equal(cache.isFresh('verified'), false, 'an entry must expire so a resumed app asks the server again')
assert.ok(VERIFIED_TRANSACTION_TTL_MS <= 60 * 60 * 1000, 'the window must stay far shorter than any billing period')

const store = readFileSync(new URL('./store.ts', import.meta.url), 'utf8')
const restore = store.slice(store.indexOf('export async function restoreStorePurchases'), store.indexOf('export async function reconcilePendingStorePurchases'))
assert.match(restore, /verifyTransaction\(transaction, true, \{ force: true \}\)/,
  'RESTORE PURCHASES must always reach the server, never report a cached success')
assert.doesNotMatch(store, /new Set<string>\(\)/, 'verified transactions must not be remembered for the life of the process')

console.log('store verification cache: ok')
