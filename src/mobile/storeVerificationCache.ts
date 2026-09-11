// How long a verified store transaction is trusted before the server is asked again.
// Long enough to swallow the duplicate calls a single purchase or resume produces,
// far too short to outlive a renewal.
export const VERIFIED_TRANSACTION_TTL_MS = 10 * 60 * 1000

export interface VerificationIdentitySource {
  transactionId?: string
  purchaseToken?: string
  jwsRepresentation?: string
  orderId?: string
}

/**
 * Google keeps one purchase token for the whole life of a subscription and issues
 * a new order id on every renewal, so the token alone remembers a renewal as a
 * transaction that was already verified. StoreKit gives each renewal its own
 * transaction id, so iOS needs nothing extra.
 */
export function verificationIdentity(transaction: VerificationIdentitySource, platform: 'ios' | 'android' | null) {
  const identity = transaction.transactionId || transaction.purchaseToken || transaction.jwsRepresentation || ''
  return platform === 'android' && transaction.orderId ? `${identity}:${transaction.orderId}` : identity
}

export function createVerifiedTransactionCache(ttlMs = VERIFIED_TRANSACTION_TTL_MS, now: () => number = Date.now) {
  const verifiedAt = new Map<string, number>()
  return {
    isFresh(key: string) {
      const at = verifiedAt.get(key)
      if (at === undefined) return false
      if (now() - at < ttlMs) return true
      verifiedAt.delete(key)
      return false
    },
    remember(key: string) {
      verifiedAt.set(key, now())
    },
  }
}
