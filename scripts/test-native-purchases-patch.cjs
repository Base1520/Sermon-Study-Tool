const assert = require('assert')
const fs = require('fs')
const path = require('path')

const iosTarget = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capgo',
  'native-purchases',
  'ios',
  'Sources',
  'NativePurchasesPlugin',
  'NativePurchasesPlugin.swift',
)
const androidTarget = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capgo',
  'native-purchases',
  'android',
  'src',
  'main',
  'java',
  'ee',
  'forgr',
  'nativepurchases',
  'NativePurchasesPlugin.java',
)
const mobileAppTarget = path.join(__dirname, '..', 'src', 'mobile', 'MobileApp.tsx')
const mobileStoreTarget = path.join(__dirname, '..', 'src', 'mobile', 'store.ts')
const androidBuildTarget = path.join(__dirname, '..', 'android', 'app', 'build.gradle')
const androidProguardTarget = path.join(__dirname, '..', 'android', 'app', 'proguard-rules.pro')
const iosSource = fs.readFileSync(iosTarget, 'utf8')
const agentChatSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'AgentChat.tsx'), 'utf8')
const listener = iosSource.slice(
  iosSource.indexOf('private func startTransactionUpdatesListener()'),
  iosSource.indexOf('@objc func isBillingSupported'),
)
const iosRestore = iosSource.slice(
  iosSource.indexOf('@objc func restorePurchases'),
  iosSource.indexOf('@objc func getProducts'),
)
const acknowledgement = iosSource.slice(iosSource.indexOf('@objc func acknowledgePurchase'))
const androidSource = fs.readFileSync(androidTarget, 'utf8')
const androidRestore = androidSource.slice(
  androidSource.indexOf('public void restorePurchases'),
  androidSource.indexOf('private void querySingleProductDetails'),
)
const androidBillingLaunch = androidSource.slice(
  androidSource.indexOf('BillingResult billingResult2 = billingClient.launchBillingFlow'),
  androidSource.indexOf('private void processUnfinishedPurchases'),
)
const androidPurchase = androidSource.slice(
  androidSource.indexOf('public void purchaseProduct'),
  androidSource.indexOf('private void processUnfinishedPurchases'),
)
const androidGetPurchases = androidSource.slice(
  androidSource.indexOf('public void getPurchases'),
  androidSource.indexOf('public void manageSubscriptions'),
)
const mobileAppSource = fs.readFileSync(mobileAppTarget, 'utf8')
const agentChatCatch = agentChatSource.slice(
  agentChatSource.indexOf('} catch (err: unknown) {'),
  agentChatSource.indexOf('} finally {', agentChatSource.indexOf('} catch (err: unknown) {')),
)
const mobileStoreSource = fs.readFileSync(mobileStoreTarget, 'utf8')
const mobileStorePurchase = mobileStoreSource.slice(
  mobileStoreSource.indexOf('export async function purchaseStorePlan'),
  mobileStoreSource.indexOf('export async function restoreStorePurchases'),
)
const revokedAccountCleanup = mobileAppSource.slice(
  mobileAppSource.indexOf('if (reachedServer && state?.anonymous)'),
  mobileAppSource.indexOf('if (state && !state.anonymous && state.accountId)'),
)
const explicitAccountDeletion = mobileAppSource.slice(
  mobileAppSource.indexOf('const deleteAccount = async'),
  mobileAppSource.indexOf('const linkedAccount ='),
)
const androidBuildSource = fs.readFileSync(androidBuildTarget, 'utf8')
const androidProguardSource = fs.readFileSync(androidProguardTarget, 'utf8')

assert(listener.includes('notifyListeners("transactionUpdated"'))
assert(!listener.includes('transaction.finish()'))
assert(iosRestore.includes('AppStore.sync()'))
assert(!iosRestore.includes('finishTransaction'))
assert(acknowledgement.includes('await transaction.finish()'))
assert(!androidRestore.includes('processUnfinishedPurchases()'))
assert(!androidRestore.includes('acknowledgePurchase'))
assert(androidBillingLaunch.includes('billingResult2.getResponseCode() != BillingClient.BillingResponseCode.OK'))
assert(androidBillingLaunch.includes('call.reject('))
assert(androidPurchase.includes('Subscription base plan is required'))
assert(androidPurchase.includes('Subscription base plan not found: '))
assert(!androidPurchase.includes('Using first available offer'))
assert(!androidPurchase.includes('getSubscriptionOfferDetails().get(0)'))
assert(androidGetPurchases.includes('java.util.function.Consumer<String> rejectQuery'))
assert(androidGetPurchases.includes('billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK'))
assert(androidGetPurchases.includes('Google Play returned a malformed in-app purchase list'))
assert(androidGetPurchases.includes('Google Play returned a malformed subscription list'))
assert(androidGetPurchases.includes('call.reject("Unknown product type: " + productType)'))
assert(!/Log\.[a-z]+\([^\n]*(?:purchase\.toString\(\)|purchase\.getPurchaseToken\(\)|\+\s*purchaseToken|purchaseToken\s*\+|selectedOfferDetails\.getOfferToken\(\)|purchase\.getOrderId\(\))/i.test(androidSource))
assert(!revokedAccountCleanup.includes('deleteLocalStudies('))
assert(revokedAccountCleanup.includes('clearActiveReading()'))
assert(revokedAccountCleanup.indexOf('clearActiveReading()') < revokedAccountCleanup.indexOf('clearAccountId()'))
assert(explicitAccountDeletion.includes('await deleteLocalStudies(deletedOwnerKey)'))
assert(!explicitAccountDeletion.includes('deleteLocalStudies(deletedOwnerKey).catch'))
assert(explicitAccountDeletion.includes('if (serverDeleted)'))
assert(explicitAccountDeletion.includes('could not erase its saved local studies'))
assert(mobileStorePurchase.includes('await assertStorePurchaseEnabled(platform)'))
assert(mobileStorePurchase.indexOf('await assertStorePurchaseEnabled(platform)') < mobileStorePurchase.indexOf('NativePurchases.purchaseProduct'))
assert(/release\s*\{[\s\S]*?minifyEnabled true/.test(androidBuildSource))
assert(androidBuildSource.includes("getDefaultProguardFile('proguard-android-optimize.txt')"))
assert(androidProguardSource.includes('-assumenosideeffects class android.util.Log'))
assert(androidProguardSource.includes('-assumenosideeffects class com.google.android.gms.internal.play_billing.zzc'))
assert(agentChatSource.includes("import { friendlyApiErrorText } from '../lib/apiErrors'"))
assert(agentChatCatch.includes('content: friendlyApiErrorText(err)'))
assert(!agentChatCatch.includes("content: `Error: ${err?.message"))
assert(!agentChatCatch.includes('content: String(err)'))
// SAME DEFECT, SECOND SURFACE. The Scholar panel had the identical raw-IPC catch that
// produced the screenshot: `Error: ${err?.message}` wrapping Electron's own
// "Error invoking remote method" prefix. Found only by grepping the BUILT asar, which
// still contained one occurrence after AgentChat was fixed. Guarded here so the pair
// cannot drift apart again.
const scholarChatSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ScholarChat.tsx'), 'utf8')
const scholarChatCatch = scholarChatSource.slice(
  scholarChatSource.indexOf('} catch (err: unknown) {'),
  scholarChatSource.indexOf('} finally {', scholarChatSource.indexOf('} catch (err: unknown) {')),
)
assert(scholarChatSource.includes("import { friendlyApiErrorText } from '../lib/apiErrors'"))
assert(scholarChatCatch.includes('content: friendlyApiErrorText(err)'))
assert(!scholarChatCatch.includes('content: `Error: ${err?.message'))
process.stdout.write('native-purchases and local-deletion release guards passed\n')
