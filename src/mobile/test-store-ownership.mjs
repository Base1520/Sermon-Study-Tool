import assert from 'node:assert/strict'
import { classifyStoreOwnership } from './storeOwnership.ts'

const accountId = 'e621e1f8-c36c-495a-93fc-0c247a3e6e5f'

assert.equal(classifyStoreOwnership([], accountId), 'none')
assert.equal(classifyStoreOwnership([{ appAccountToken: 'E621E1F8-C36C-495A-93FC-0C247A3E6E5F' }], accountId), 'this-account',
  'StoreKit returns the token uppercase; the owner must still be recognised')
assert.equal(classifyStoreOwnership([{ appAccountToken: accountId }], accountId), 'this-account',
  'Google returns the account id exactly as it was sent')
assert.equal(classifyStoreOwnership([{ appAccountToken: '11111111-2222-3333-4444-555555555555' }], accountId), 'other-account')
assert.equal(classifyStoreOwnership([{ appAccountToken: null }], accountId), 'other-account',
  'a purchase with no token is not proof of ownership')
assert.equal(classifyStoreOwnership([{ appAccountToken: accountId.toUpperCase() }], null), 'other-account',
  'without an account there is no owner')

console.log('store ownership: ok')
