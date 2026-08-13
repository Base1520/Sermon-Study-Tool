export interface StoreCatalogDefinition {
  plan: string
  appleProductId: string
  googleProductId: string
  androidBasePlanId: string
}

export interface StoreProductIdentity {
  identifier: string
  planIdentifier?: string
}

export type StoreCatalogPlatform = 'ios' | 'android'

export class IncompleteStoreCatalogError extends Error {
  readonly missingPlans: string[]

  constructor(platform: StoreCatalogPlatform, expectedCount: number, matchedCount: number, missingPlans: string[]) {
    const storeName = platform === 'ios' ? 'The App Store' : 'Google Play'
    super(`${storeName} returned an incomplete Operator plan catalog (matched ${matchedCount} of ${expectedCount}; missing: ${missingPlans.join(', ')}). Purchases are temporarily unavailable. Try again later.`)
    this.name = 'IncompleteStoreCatalogError'
    this.missingPlans = missingPlans
  }
}

export function requireCompleteStoreCatalog(
  definitions: StoreCatalogDefinition[],
  products: StoreProductIdentity[],
  platform: StoreCatalogPlatform,
): number[] {
  const productIndexes = definitions.map((definition) => products.findIndex((product) =>
    platform === 'android'
      ? product.planIdentifier === definition.googleProductId && product.identifier === definition.androidBasePlanId
      : product.identifier === definition.appleProductId))
  const missingPlans = definitions
    .filter((_, index) => productIndexes[index] === -1)
    .map((definition) => definition.plan)

  if (missingPlans.length > 0) {
    throw new IncompleteStoreCatalogError(
      platform,
      definitions.length,
      definitions.length - missingPlans.length,
      missingPlans,
    )
  }

  return productIndexes
}
