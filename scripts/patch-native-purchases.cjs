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

const vulnerableListener = `                        alwaysIncludeWillCancel: true
                    )
                    await transaction.finish()
                    try? await Task.sleep(nanoseconds: 500_000_000)`
const fixedListener = `                        alwaysIncludeWillCancel: true
                    )
                    try? await Task.sleep(nanoseconds: 500_000_000)`
const vulnerableIosRestore = `                try await AppStore.sync()
                for transaction in SKPaymentQueue.default().transactions {
                    SKPaymentQueue.default().finishTransaction(transaction)
                }
                await MainActor.run { call.resolve() }`
const fixedIosRestore = `                try await AppStore.sync()
                await MainActor.run { call.resolve() }`
const vulnerableAndroidRestore = `        withBillingClient(call, () -> {
            this.processUnfinishedPurchases();
            call.resolve();
            Log.d(TAG, "restorePurchases() completed");
        });`
const fixedAndroidRestore = `        call.resolve();
        Log.d(TAG, "restorePurchases() completed without acknowledging purchases");`
const vulnerableAndroidBillingLaunch = `                        Log.i(NativePurchasesPlugin.TAG, "onProductDetailsResponse2" + billingResult2);`
const fixedAndroidBillingLaunch = `                        Log.i(NativePurchasesPlugin.TAG, "onProductDetailsResponse2" + billingResult2);
                        if (billingResult2.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            closeBillingClient();
                            call.reject(
                                "Purchase could not start: " + billingResult2.getResponseCode() + " - " + billingResult2.getDebugMessage()
                            );
                            return;
                        }`
const vulnerableAndroidBasePlanSelection = `                                // list the SubscriptionOfferDetails and find the one who match the planIdentifier if not found get the first one
                                ProductDetails.SubscriptionOfferDetails selectedOfferDetails = null;
                                assert productDetailsItem.getSubscriptionOfferDetails() != null;
                                Log.d(TAG, "Available offer details count: " + productDetailsItem.getSubscriptionOfferDetails().size());
                                for (ProductDetails.SubscriptionOfferDetails offerDetails : productDetailsItem.getSubscriptionOfferDetails()) {
                                    Log.d(TAG, "Checking offer: " + offerDetails.getBasePlanId());
                                    if (offerDetails.getBasePlanId().equals(planIdentifier)) {
                                        selectedOfferDetails = offerDetails;
                                        Log.d(TAG, "Found matching plan: " + planIdentifier);
                                        break;
                                    }
                                }
                                if (selectedOfferDetails == null) {
                                    selectedOfferDetails = productDetailsItem.getSubscriptionOfferDetails().get(0);
                                    Log.d(TAG, "Using first available offer: " + selectedOfferDetails.getBasePlanId());
                                }
                                productDetailsParams.setOfferToken(selectedOfferDetails.getOfferToken());
                                Log.d(TAG, "Set offer token: " + selectedOfferDetails.getOfferToken());`
const fixedAndroidBasePlanSelection = `                                ProductDetails.SubscriptionOfferDetails selectedOfferDetails = null;
                                List<ProductDetails.SubscriptionOfferDetails> offerDetailsList = productDetailsItem.getSubscriptionOfferDetails();
                                if (planIdentifier == null || planIdentifier.isEmpty()) {
                                    closeBillingClient();
                                    call.reject("Subscription base plan is required");
                                    return;
                                }
                                if (offerDetailsList == null || offerDetailsList.isEmpty()) {
                                    closeBillingClient();
                                    call.reject("Subscription base plan not found: " + planIdentifier);
                                    return;
                                }
                                Log.d(TAG, "Available offer details count: " + offerDetailsList.size());
                                for (ProductDetails.SubscriptionOfferDetails offerDetails : offerDetailsList) {
                                    Log.d(TAG, "Checking offer: " + offerDetails.getBasePlanId());
                                    if (offerDetails.getBasePlanId().equals(planIdentifier)) {
                                        selectedOfferDetails = offerDetails;
                                        Log.d(TAG, "Found matching plan: " + planIdentifier);
                                        break;
                                    }
                                }
                                if (selectedOfferDetails == null) {
                                    closeBillingClient();
                                    call.reject("Subscription base plan not found: " + planIdentifier);
                                    return;
                                }
                                productDetailsParams.setOfferToken(selectedOfferDetails.getOfferToken());
                                Log.d(TAG, "Set offer token for requested base plan");`
const vulnerableAndroidUnknownPurchaseType = `        if (!queryInApp && !querySubs) {
            Log.d(TAG, "Unknown product type filter provided, returning empty result");
            JSObject result = new JSObject();
            result.put("purchases", new JSONArray());
            call.resolve(result);
            return;
        }`
const fixedAndroidUnknownPurchaseType = `        if (!queryInApp && !querySubs) {
            Log.d(TAG, "Unknown product type filter provided");
            call.reject("Unknown product type: " + productType);
            return;
        }`
const vulnerableAndroidPurchaseQueryState = `            AtomicInteger pendingQueries = new AtomicInteger((queryInApp ? 1 : 0) + (querySubs ? 1 : 0));
            AtomicBoolean finished = new AtomicBoolean(false);

            Runnable maybeFinish = () -> {`
const fixedAndroidPurchaseQueryState = `            AtomicInteger pendingQueries = new AtomicInteger((queryInApp ? 1 : 0) + (querySubs ? 1 : 0));
            AtomicBoolean finished = new AtomicBoolean(false);
            java.util.function.Consumer<String> rejectQuery = message -> {
                if (finished.compareAndSet(false, true)) {
                    closeBillingClient();
                    call.reject(message);
                }
            };

            Runnable maybeFinish = () -> {`
const vulnerableAndroidInAppQueryGuard = `                    try {
                        Log.d(TAG, "In-app purchases query result: " + billingResult.getResponseCode());
                        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {`
const fixedAndroidInAppQueryGuard = `                    try {
                        if (billingResult == null) {
                            rejectQuery.accept("Google Play returned a malformed in-app purchase response");
                            return;
                        }
                        Log.d(TAG, "In-app purchases query result: " + billingResult.getResponseCode());
                        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            rejectQuery.accept(
                                "Google Play could not load in-app purchases: " +
                                billingResult.getResponseCode() +
                                " - " +
                                billingResult.getDebugMessage()
                            );
                            return;
                        }
                        if (purchases == null) {
                            rejectQuery.accept("Google Play returned a malformed in-app purchase list");
                            return;
                        }
                        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {`
const vulnerableAndroidInAppQueryCatch = `                    } catch (Exception ex) {
                        Log.d(TAG, "Error processing in-app purchase query: " + ex.getMessage());
                    } finally {`
const fixedAndroidInAppQueryCatch = `                    } catch (Exception ex) {
                        Log.d(TAG, "Error processing in-app purchase query: " + ex.getMessage());
                        rejectQuery.accept("Google Play returned a malformed in-app purchase response");
                    } finally {`
const vulnerableAndroidSubscriptionQueryGuard = `                    try {
                        Log.d(TAG, "Subscription purchases query result: " + billingResult.getResponseCode());
                        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {`
const fixedAndroidSubscriptionQueryGuard = `                    try {
                        if (billingResult == null) {
                            rejectQuery.accept("Google Play returned a malformed subscription response");
                            return;
                        }
                        Log.d(TAG, "Subscription purchases query result: " + billingResult.getResponseCode());
                        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            rejectQuery.accept(
                                "Google Play could not load subscriptions: " +
                                billingResult.getResponseCode() +
                                " - " +
                                billingResult.getDebugMessage()
                            );
                            return;
                        }
                        if (purchases == null) {
                            rejectQuery.accept("Google Play returned a malformed subscription list");
                            return;
                        }
                        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {`
const vulnerableAndroidSubscriptionQueryCatch = `                    } catch (Exception ex) {
                        Log.d(TAG, "Error processing subscription purchase query: " + ex.getMessage());
                    } finally {`
const fixedAndroidSubscriptionQueryCatch = `                    } catch (Exception ex) {
                        Log.d(TAG, "Error processing subscription purchase query: " + ex.getMessage());
                        rejectQuery.accept("Google Play returned a malformed subscription response");
                    } finally {`

const sensitiveAndroidLogLines = [
  '        Log.d(TAG, "Purchase details: " + purchase.toString());\n',
  '        Log.i(NativePurchasesPlugin.TAG, "handlePurchase" + purchase);\n',
  '        Log.d(TAG, "Purchase token: " + purchase.getPurchaseToken());\n',
  '            Log.d(TAG, "Resolving purchase call with transactionId: " + purchase.getPurchaseToken());\n',
  '        Log.d(TAG, "acknowledgePurchase() called with token: " + purchaseToken);\n',
  '                Log.d(TAG, "Processing purchase: " + purchase.getOrderId());\n',
  '        Log.d(TAG, "Purchase token: " + purchaseToken);\n',
  '            Log.i(NativePurchasesPlugin.TAG, "onConsumeResponse OK " + billingResult + purchaseToken);\n',
  '            Log.i(NativePurchasesPlugin.TAG, "onConsumeResponse OTHER " + billingResult + purchaseToken);\n',
  '                            Log.d(TAG, "Offer token: " + selectedOfferDetails.getOfferToken());\n',
  '                                Log.d(TAG, "Processing in-app purchase: " + purchase.getOrderId());\n',
  '                                Log.d(TAG, "Processing subscription purchase: " + purchase.getOrderId());\n',
  '        Log.d(TAG, "Manually acknowledging purchase with token: " + purchaseToken);\n',
  '        Log.d(TAG, "Consuming purchase with token: " + purchaseToken);\n',
]

for (const target of [iosTarget, androidTarget]) {
  if (!fs.existsSync(target)) throw new Error(`The native-purchases source is missing: ${target}`)
}

function applyRequiredPatch(source, vulnerable, fixed, label) {
  if (source.includes(fixed)) return { source, changed: false }
  if (!source.includes(vulnerable)) {
    throw new Error(`The native-purchases ${label} changed upstream; review the verification-order patch before building.`)
  }
  return { source: source.replace(vulnerable, fixed), changed: true }
}

let iosSource = fs.readFileSync(iosTarget, 'utf8')
let iosChanged = false
for (const [vulnerable, fixed, label] of [
  [vulnerableListener, fixedListener, 'iOS transaction listener'],
  [vulnerableIosRestore, fixedIosRestore, 'iOS restore path'],
]) {
  const result = applyRequiredPatch(iosSource, vulnerable, fixed, label)
  iosSource = result.source
  iosChanged ||= result.changed
}
if (iosChanged) fs.writeFileSync(iosTarget, iosSource)

let androidSource = fs.readFileSync(androidTarget, 'utf8')
let androidChanged = false
for (const [vulnerable, fixed, label] of [
  [vulnerableAndroidRestore, fixedAndroidRestore, 'Android restore path'],
  [vulnerableAndroidBillingLaunch, fixedAndroidBillingLaunch, 'Android billing launch'],
  [vulnerableAndroidBasePlanSelection, fixedAndroidBasePlanSelection, 'Android exact base-plan selection'],
  [vulnerableAndroidUnknownPurchaseType, fixedAndroidUnknownPurchaseType, 'Android unknown purchase type'],
  [vulnerableAndroidPurchaseQueryState, fixedAndroidPurchaseQueryState, 'Android purchase query state'],
  [vulnerableAndroidInAppQueryGuard, fixedAndroidInAppQueryGuard, 'Android in-app purchase query response'],
  [vulnerableAndroidInAppQueryCatch, fixedAndroidInAppQueryCatch, 'Android in-app purchase query exception'],
  [vulnerableAndroidSubscriptionQueryGuard, fixedAndroidSubscriptionQueryGuard, 'Android subscription query response'],
  [vulnerableAndroidSubscriptionQueryCatch, fixedAndroidSubscriptionQueryCatch, 'Android subscription query exception'],
]) {
  const result = applyRequiredPatch(androidSource, vulnerable, fixed, label)
  androidSource = result.source
  androidChanged ||= result.changed
}
for (const logLine of sensitiveAndroidLogLines) {
  if (!androidSource.includes(logLine)) continue
  androidSource = androidSource.replace(logLine, '')
  androidChanged = true
}
if (/Log\.[a-z]+\([^\n]*(?:purchase\.toString\(\)|purchase\.getPurchaseToken\(\)|\+\s*purchaseToken|purchaseToken\s*\+|selectedOfferDetails\.getOfferToken\(\)|purchase\.getOrderId\(\))/i.test(androidSource)) {
  throw new Error('The native-purchases Android source still logs sensitive purchase data; review the patch before building.')
}
if (androidChanged) fs.writeFileSync(androidTarget, androidSource)

process.stdout.write(
  iosChanged || androidChanged
    ? 'native-purchases verify-before-finalize patches applied\n'
    : 'native-purchases verify-before-finalize patches already applied\n',
)
