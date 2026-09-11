export type StoreSubscriptionOwnership = 'this-account' | 'other-account' | 'none'

interface OwnedPurchase {
  appAccountToken?: string | null
}

/**
 * Classify the store's current Operator purchases against an Operator account.
 *
 * StoreKit returns appAccountToken as UUID.uuidString, which is UPPERCASE, while
 * Operator account ids come out of Postgres lowercase — an exact comparison never
 * recognised a single Apple subscriber as the owner of his own subscription. Google
 * returns the obfuscated account id exactly as it was sent. So case is ignored.
 */
export function classifyStoreOwnership(
  purchases: OwnedPurchase[],
  accountId: string | null | undefined,
): StoreSubscriptionOwnership {
  if (!purchases.length) return 'none'
  const want = accountId ? accountId.toLowerCase() : null
  return want && purchases.some((purchase) =>
    typeof purchase.appAccountToken === 'string' && purchase.appAccountToken.toLowerCase() === want)
    ? 'this-account'
    : 'other-account'
}
