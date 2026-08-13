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

const verifiedTransactions = new Set<string>()
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

function catalogForPlatform(platform: StorePlatform) {
  return platform === 'ios'
    ? catalog.products.filter((product) => product.plan !== 'heavy_annual')
    : catalog.products
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

function productForDefinition(products: Product[], definition: (typeof catalog.products)[number]) {
  if (Capacitor.getPlatform() === 'android') {
    return products.find((product) =>
      product.planIdentifier === definition.googleProductId &&
      product.identifier === definition.androidBasePlanId)
  }
  return products.find((product) => product.identifier === definition.appleProductId)
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
  return definitions.flatMap((definition) => {
    const product = productForDefinition(products, definition)
    return product ? [{
      ...definition,
      title: product.title,
      description: product.description,
      priceString: product.priceString,
      product,
    }] : []
  })
}

async function transactionVerificationKey(transaction: Transaction) {
  const identity = transaction.transactionId || transaction.purchaseToken || transaction.jwsRepresentation
  const accountId = await getAccountId().catch(() => null)
  return `${accountId || 'anonymous'}:${nativePlatform()}:${identity}`
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

async function verifyTransaction(transaction: Transaction, restoring: boolean) {
  const key = await transactionVerificationKey(transaction)
  if (verifiedTransactions.has(key)) return
  const pending = inFlightVerifications.get(key)
  if (pending) return pending

  const verification = performTransactionVerification(transaction, restoring)
    .then(() => { verifiedTransactions.add(key) })
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
      await verifyTransaction(transaction, true)
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

export async function reconcilePendingStorePurchases() {
  const platform = nativePlatform()
  if (!platform) return 0
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
    onlyCurrentEntitlements: platform === 'ios',
  })
  let reconciled = 0
  for (const transaction of purchases.filter((purchase) =>
    definitionForTransaction(purchase) && (
      platform === 'ios' || (purchase.purchaseState === '1' && purchase.isAcknowledged === false)
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
