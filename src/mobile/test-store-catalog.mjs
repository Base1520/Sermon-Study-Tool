import { readFileSync } from 'node:fs'
import ts from 'typescript'

const helperSource = readFileSync(new URL('./storeCatalog.ts', import.meta.url), 'utf8')
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { requireCompleteStoreCatalog } = await import(
  'data:text/javascript;base64,' + Buffer.from(helperJs).toString('base64')
)
const catalog = JSON.parse(readFileSync(new URL('../../server/src/iap-products.json', import.meta.url), 'utf8'))
const storeSource = readFileSync(new URL('./store.ts', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('./MobileApp.tsx', import.meta.url), 'utf8')

let passed = 0
let failed = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    passed += 1
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const iosDefinitions = catalog.products.filter((product) => product.plan !== 'heavy_annual')
const iosProducts = iosDefinitions.map((definition) => ({ identifier: definition.appleProductId }))
const androidDefinitions = catalog.products.filter((product) => product.plan !== 'heavy_annual')
const androidProducts = androidDefinitions.map((definition) => ({
  identifier: definition.androidBasePlanId,
  planIdentifier: definition.googleProductId,
}))

console.log('\nCOMPLETE NATIVE STORE CATALOGS')
check(
  'all five App Store products resolve in catalog order',
  JSON.stringify(requireCompleteStoreCatalog(iosDefinitions, iosProducts, 'ios')) === JSON.stringify([0, 1, 2, 3, 4]),
)
check(
  'all five Google Play base plans resolve in catalog order (Heavy Annual is web-only: Play caps USD at $999.99)',
  JSON.stringify(requireCompleteStoreCatalog(androidDefinitions, androidProducts, 'android')) === JSON.stringify([0, 1, 2, 3, 4]),
)
check(
  'Heavy Annual is excluded from the Android definitions',
  !androidDefinitions.some((definition) => definition.plan === 'heavy_annual'),
)

console.log('\nPARTIAL CATALOG FAILS CLOSED')
{
  const droppedPlan = 'standard'
  const partialProducts = iosProducts.filter((_, index) => iosDefinitions[index].plan !== droppedPlan)
  let error = null
  try {
    requireCompleteStoreCatalog(iosDefinitions, partialProducts, 'ios')
  } catch (caught) {
    error = caught
  }
  check(`dropped App Store product is diagnosed by plan name: ${droppedPlan}`, error?.missingPlans?.includes(droppedPlan), error?.message || 'no error was thrown')
  check('partial App Store diagnostic reports matched and expected counts', error?.message?.includes('matched 4 of 5'), error?.message || 'no error was thrown')
  check('partial App Store catalog blocks purchases', error?.message?.includes('Purchases are temporarily unavailable'), error?.message || 'no error was thrown')
}

console.log('\nPRODUCTION LOAD AND UI CONNECTION')
check(
  'loadStorePlans enforces the complete-catalog helper',
  storeSource.includes('requireCompleteStoreCatalog(definitions, products, platform)'),
)
check(
  'a failed reload clears any previously rendered plan cards',
  /\.catch\(\(caught\) => \{\s*if \(!cancelled\) \{\s*setStorePlans\(\[\]\)/s.test(appSource),
)
check(
  'an empty native catalog renders an inline unavailable warning',
  appSource.includes('storePlans.length > 0') && appSource.includes('STORE PLANS ARE TEMPORARILY UNAVAILABLE.'),
)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
