const {
  normalizeEmail,
  normalizeDownloadEmail,
  webPlan,
  downloadAsset,
  optedIntoMarketing,
  generatePurchaseCode,
  isPurchaseCode,
  hashPurchaseCode,
  claimPurchasedAccount,
  renderPurchaseComplete,
  renderPurchaseMessage,
} = require('./web-purchase')

let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => {
  if (condition) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

function fakeDb(code, { status = 'active', plan = 'starter' } = {}) {
  const row = {
    id: 'account-1', email: 'pastor@example.com', plan, status,
    purchase_code_hash: hashPurchaseCode(code), purchase_redeemed_install_id: null,
  }
  return {
    row,
    async query(_sql, [codeHash, installId, allowedPlans]) {
      const allowed = row.purchase_code_hash === codeHash && row.status === 'active' &&
        allowedPlans.includes(row.plan) &&
        (!row.purchase_redeemed_install_id || row.purchase_redeemed_install_id === installId)
      if (!allowed) return { rows: [] }
      row.purchase_redeemed_install_id ||= installId
      return { rows: [{ id: row.id, email: row.email, plan: row.plan, status: row.status }] }
    },
  }
}

;(async () => {
  console.log('\nWEBSITE PURCHASE INPUTS ARE BOUNDED')
  ok('email is normalized', normalizeEmail('  Pastor@Example.COM ') === 'pastor@example.com')
  ok('bad email is rejected', normalizeEmail('not-an-email') === null)
  ok('reserved test domains never pollute the download list',
    normalizeDownloadEmail('capture@example.invalid') === null)
  ok('only real paid plans are accepted', webPlan('standard')?.priceUsd === 49.99)
  ok('annual plans are accepted', webPlan('standard_annual')?.priceUsd === 499.99)
  ok('free is not a web checkout plan', webPlan('free') === null)
  ok('download platforms resolve only to fixed assets',
    /The-Operator-windows\.exe$/.test(downloadAsset('windows')?.url || ''))
  ok('a supplied URL cannot become a download target', downloadAsset('https://evil.example/file') === null)
  ok('marketing consent accepts form values explicitly',
    optedIntoMarketing('on') === true && optedIntoMarketing('') === false)

  console.log('\nTHE ACTIVATION CODE IS A REAL ONE-TIME CREDENTIAL')
  const code = generatePurchaseCode()
  ok('code has the purchase-only shape', isPurchaseCode(code), code)
  ok('code carries at least 96 random bits', code.slice(4).replaceAll('-', '').length === 24)
  ok('only the hash needs to be stored', hashPurchaseCode(code) === hashPurchaseCode(code.toLowerCase()))

  const db = fakeDb(code)
  const first = await claimPurchasedAccount(db, { code, installId: 'install-a' })
  ok('the first install activates', first?.plan === 'starter')
  const retry = await claimPurchasedAccount(db, { code, installId: 'install-a' })
  ok('a lost response can retry on the same install', retry?.id === 'account-1')
  const stolen = await claimPurchasedAccount(db, { code, installId: 'install-b' })
  ok('the code cannot activate a second install', stolen === null)

  const inactiveCode = generatePurchaseCode()
  const inactive = fakeDb(inactiveCode, { status: 'none' })
  const unpaid = await claimPurchasedAccount(inactive, {
    code: inactiveCode, installId: 'install-c',
  })
  ok('an unpaid account cannot activate', unpaid === null)

  const annualCode = generatePurchaseCode()
  const annualDb = fakeDb(annualCode, { plan: 'heavy_annual' })
  const annual = await claimPurchasedAccount(annualDb, {
    code: annualCode, installId: 'install-annual',
  })
  ok('an annual purchase activates through the same one-time code path',
    annual?.plan === 'heavy_annual')

  console.log('\nTHE RETURN PAGE SAYS EXACTLY WHAT HAPPENS NEXT')
  const html = renderPurchaseComplete({
    code, plan: { label: 'Starter' }, email: 'pastor@example.com', redeemed: false,
  })
  ok('the code is visible', html.includes(code))
  ok('the app step is explicit', /Open Settings/.test(html) && /Paste/.test(html))
  ok('both platform downloads are present', /apple-silicon/.test(html) && /windows\.exe/.test(html))
  const safe = renderPurchaseMessage({ title: '<Nope>', message: '<script>bad()</script>' })
  ok('server messages escape HTML', !safe.includes('<script>bad()</script>'))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
