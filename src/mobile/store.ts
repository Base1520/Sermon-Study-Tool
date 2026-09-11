import { Browser } from '@capacitor/browser'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import {
  NativePurchases,
  PURCHASE_TYPE,
  type Product,
  type Transaction,
} from '@capgo/native-purchases'
import catalog from '../../server/src/iap-products.json'
import { getReleaseStatus, verifyStorePurchase } from './api'
import { getAccountId } from './storage'
import { requireCompleteStoreCatalog } from './storeCatalog'
import { createVerifiedTransactionCache, verificationIdentity } from './storeVerificationCache'
import { classifyStoreOwnership, type StoreSubscriptionOwnership } from './storeOwnership'

export interface StorePlan {
  plan: string
  appleProductId: string
  googleProductId: string
  androidBasePlanId: string
  title: string
  description: string
  priceString: string
  product: Product
}

const verifiedTransactions = createVerifiedTransactionCache()
const inFlightVerifications = new Map<string, Promise<void>>()

export class StoreFinalizationPendingError extends Error {
  constructor() {
    super('Your subscription is active. Store confirmation will retry automatically.')
    this.name = 'StoreFinalizationPendingError'
  }
}

export function isStoreFinalizationPendingError(error: unknown): error is StoreFinalizationPendingError {
  return error instanceof StoreFinalizationPendingError
}

type StorePlatform = 'ios' | 'android'

// Heavy Annual ($1,649.99) is web-only. Apple's subscription ceiling could not
// represent it profitably, and Google Play's hard price cap is $999.99 USD
// (£810 / €940 / ₩600,000 — every currency rejected it on 2026-08-22), so
// neither native store can carry it. Both platforms therefore request the same
// five products; the catalog keeps the heavy_annual definition for web/Stripe
// and defensive receipt recognition only.
function catalogForPlatform(platform: StorePlatform) {
  void platform
  return catalog.products.filter((product) => product.plan !== 'heavy_annual')
}

function nativePlatform(): StorePlatform | null {
  const platform = Capacitor.getPlatform()
  return platform === 'ios' || platform === 'android' ? platform : null
}

async function assertStorePurchaseEnabled(platform: StorePlatform) {
  let release
  try {
    release = await getReleaseStatus()
  } catch {
    throw new Error('The Operator could not confirm that store purchases are available. Nothing was charged.')
  }
  const enabled = platform === 'ios'
    ? release.capabilities.apple_iap
    : release.capabilities.google_iap
  if (!release.ok || release.releaseStage !== 'full' || !enabled) {
    throw new Error('Store purchases are not enabled in this Operator release. Nothing was charged.')
  }
}

function definitionForTransaction(transaction: Transaction) {
  const productId = transaction.productIdentifier
  return catalog.products.find((item) =>
    nativePlatform() === 'android'
      ? item.googleProductId === productId
      : item.appleProductId === productId) || null
}

export async function loadStorePlans(): Promise<StorePlan[]> {
  const platform = nativePlatform()
  if (!platform) return []
  const definitions = catalogForPlatform(platform)
  await assertStorePurchaseEnabled(platform)
  const supported = await NativePurchases.isBillingSupported()
  if (!supported.isBillingSupported) return []
  const { products } = await NativePurchases.getProducts({
    productIdentifiers: [...new Set(definitions.map((product) =>
      platform === 'android' ? product.googleProductId : product.appleProductId))],
    productType: PURCHASE_TYPE.SUBS,
  })
  const productIndexes = requireCompleteStoreCatalog(definitions, products, platform)
  return definitions.map((definition, index) => {
    const product = products[productIndexes[index]]
    return {
      ...definition,
      title: product.title,
      description: product.description,
      priceString: product.priceString,
      product,
    }
  })
}

async function transactionVerificationKey(transaction: Transaction) {
  const accountId = await getAccountId().catch(() => null)
  const platform = nativePlatform()
  return `${accountId || 'anonymous'}:${platform}:${verificationIdentity(transaction, platform)}`
}

async function performTransactionVerification(transaction: Transaction, restoring: boolean) {
  const platform = nativePlatform()
  if (!platform) throw new Error('Store purchases are available in the iPhone, iPad, and Android apps.')
  if (!definitionForTransaction(transaction)) throw new Error('The store returned an unknown Operator product.')
  if (platform === 'ios' && !transaction.jwsRepresentation) {
    throw new Error('The App Store did not return a signed transaction. Try Restore Purchases.')
  }
  if (platform === 'android' && !transaction.purchaseToken) {
    throw new Error('Google Play did not return a purchase token. Try Restore Purchases.')
  }
  if (platform === 'android' && transaction.purchaseState !== '1') {
    throw new Error('That Google Play purchase is not complete yet.')
  }
  const result = await verifyStorePurchase({
    platform,
    jwsRepresentation: transaction.jwsRepresentation,
    purchaseToken: transaction.purchaseToken,
    restoring,
  })
  if (result.entitlement.status !== 'active') {
    throw new Error('No active Operator subscription was found for this store account.')
  }
  if (result.entitlement.finalizationPending) throw new StoreFinalizationPendingError()
  if (platform === 'ios') {
    try {
      await NativePurchases.acknowledgePurchase({ purchaseToken: transaction.transactionId })
    } catch {
      throw new StoreFinalizationPendingError()
    }
  }
}

/**
 * Verify once per burst, never once per process.
 *
 * The dedupe used to be a Set that lived as long as the app did. On Android the
 * key was the purchase token, which Google keeps for the whole life of a
 * subscription, so once a subscription had been verified the resume-time
 * self-heal never reached the server again — and RESTORE PURCHASES counted the
 * cache hit as a success and told a locked-out subscriber he had been restored
 * without ever asking. Entries now expire, the Android key carries the renewal's
 * order id, and a restore the customer asked for always goes to the server.
 */
async function verifyTransaction(transaction: Transaction, restoring: boolean, { force = false } = {}) {
  const key = await transactionVerificationKey(transaction)
  if (!force && verifiedTransactions.isFresh(key)) return
  const pending = inFlightVerifications.get(key)
  if (pending) return pending

  const verification = performTransactionVerification(transaction, restoring)
    .then(() => { verifiedTransactions.remember(key) })
    .finally(() => { inFlightVerifications.delete(key) })
  inFlightVerifications.set(key, verification)
  return verification
}

export async function purchaseStorePlan(plan: StorePlan, accountId: string) {
  const platform = nativePlatform()
  if (!platform) throw new Error('Store purchases are available in the native app.')
  await assertStorePurchaseEnabled(platform)
  const transaction = await NativePurchases.purchaseProduct({
    productIdentifier: platform === 'android' ? plan.googleProductId : plan.appleProductId,
    planIdentifier: platform === 'android' ? plan.androidBasePlanId : undefined,
    productType: PURCHASE_TYPE.SUBS,
    quantity: 1,
    appAccountToken: accountId,
    autoAcknowledgePurchases: false,
  })
  await verifyTransaction(transaction, false)
  return transaction
}

export async function restoreStorePurchases() {
  const platform = nativePlatform()
  if (!platform) throw new Error('Restore Purchases is available in the native app.')
  if (platform === 'ios') await NativePurchases.restorePurchases()
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
    onlyCurrentEntitlements: true,
  })
  let restored = 0
  let lastError: unknown = null
  for (const transaction of purchases.filter((purchase) =>
    definitionForTransaction(purchase) && (platform !== 'android' || purchase.purchaseState === '1'))) {
    try {
      await verifyTransaction(transaction, true, { force: true })
      restored += 1
    } catch (error) {
      if (isStoreFinalizationPendingError(error)) restored += 1
      else lastError = error
    }
  }
  if (!restored) {
    if (lastError instanceof Error) throw lastError
    throw new Error('No active Operator subscription was found for this store account.')
  }
  return restored
}

/**
 * ANDROID RENEWALS USED TO DIE HERE, SILENTLY, ON DAY 31.
 *
 * The server only learns that a subscription renewed from a store notification
 * (Apple: /v1/iap/apple/notifications · Google: RTDN). Until one arrives,
 * `paid_through` still holds the FIRST period's expiry, and entitlement.js:138
 * flips an active subscriber to `canceled` the moment it passes. This function
 * is the client-side self-heal that covers the gap.
 *
 * It only healed iOS. The Android branch asked for `isAcknowledged === false`,
 * which is true only of a purchase that has never been acknowledged — i.e. a
 * brand-new one. A RENEWAL of an already-acknowledged subscription is
 * `isAcknowledged: true`, so it was filtered out and never re-verified: the man
 * kept being charged by Google and lost the app on day 31, and the only way back
 * was to find Restore Purchases himself.
 *
 * The fix is to do what this file's own restoreStorePurchases() already does for
 * Android and has always done safely — ask for current entitlements and take
 * anything in the purchased state. An unacknowledged purchase is still current
 * and still `purchaseState === '1'`, so acknowledgment is not lost; it now
 * happens on the same pass. verifiedTransactions / inFlightVerifications dedupe
 * bursts for a few minutes, never for the life of the process, so a renewal is
 * re-verified the next time the app comes back to the foreground.
 *
 * This is defence in depth, NOT a substitute for RTDN: it only runs when the
 * user opens the app.
 */
export async function reconcilePendingStorePurchases() {
  const platform = nativePlatform()
  if (!platform) return 0
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
    onlyCurrentEntitlements: true,
  })
  let reconciled = 0
  for (const transaction of purchases.filter((purchase) =>
    definitionForTransaction(purchase) && (
      platform !== 'android' || purchase.purchaseState === '1'
    ))) {
    try {
      await verifyTransaction(transaction, true)
      reconciled += 1
    } catch (error) {
      if (isStoreFinalizationPendingError(error)) reconciled += 1
    }
  }
  return reconciled
}

export type { StoreSubscriptionOwnership } from './storeOwnership'

/**
 * Whose Operator subscription does the store account on THIS device hold?
 *
 * A subscription group turns a new plan into a change of the existing subscription
 * for that store account, whichever Operator account it belongs to. So an in-app
 * plan change is safe only for 'this-account'; 'other-account' means a purchase here
 * would change someone else's subscription or start a second one. Resolves null when
 * the store could not answer — unknown, never "no".
 */
export async function storeSubscriptionOwnership(accountId: string | null | undefined): Promise<StoreSubscriptionOwnership | null> {
  const platform = nativePlatform()
  if (!platform) return 'none'
  try {
    const { purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.SUBS,
      onlyCurrentEntitlements: true,
    })
    const operator = purchases.filter((purchase) =>
      definitionForTransaction(purchase) && (platform !== 'android' || purchase.purchaseState === '1'))
    return classifyStoreOwnership(operator, accountId)
  } catch {
    return null
  }
}

export function listenForStoreTransactions(onTransaction: (transaction: Transaction) => Promise<void>) {
  if (Capacitor.getPlatform() !== 'ios') return Promise.resolve<PluginListenerHandle | null>(null)
  return NativePurchases.addListener('transactionUpdated', (transaction) => {
    if (!definitionForTransaction(transaction)) return
    void onTransaction(transaction)
  })
}

export function verifyPendingStoreTransaction(transaction: Transaction) {
  return verifyTransaction(transaction, true)
}

export async function manageStoreSubscriptions() {
  if (!nativePlatform()) throw new Error('Subscription management is available in the native app.')
  await NativePurchases.manageSubscriptions()
}

export async function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) await Browser.open({ url })
  else window.open(url, '_blank', 'noopener,noreferrer')
}

export const storePlatform = nativePlatform
