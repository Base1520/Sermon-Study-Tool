const authDefault = require('./auth')
const { accessCodeUnavailable, compAccountEmail } = require('./access-code-policy')
const { entitlementFor, PLANS } = require('./entitlement')
const { adoptInstallAndIssueDeviceToken } = require('./install-data-adoption')
const { isPurchaseCode, claimPurchasedAccount } = require('./web-purchase')

async function transactionResult(db, operation) {
  const client = await db.connect()
  let finished = false
  try {
    await client.query('BEGIN')
    const result = await operation(client)
    if (!result) {
      await client.query('ROLLBACK')
      finished = true
      return null
    }
    await client.query('COMMIT')
    finished = true
    return result
  } catch (error) {
    if (!finished) await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * Redeem one website-purchase or comp code and activate this install.
 *
 * Account selection/creation, anonymous-data adoption, and device-token issue
 * share one database transaction. A failure therefore cannot leave a real
 * account whose studies are still stranded under the anonymous install.
 */
async function redeemAccessCode(db, {
  code: value,
  installId,
  auth = authDefault,
} = {}) {
  const codeValue = String(value || '').trim().toUpperCase()
  if (!codeValue || !installId) return null

  return transactionResult(db, async (client) => {
    if (isPurchaseCode(codeValue)) {
      const purchased = await claimPurchasedAccount(client, { code: codeValue, installId })
      if (!purchased) return null
      const { token } = await adoptInstallAndIssueDeviceToken(client, auth, {
        accountId: purchased.id,
        installId,
        label: 'Website purchase',
      })
      return {
        token,
        accountId: purchased.id,
        ...entitlementFor(purchased),
        label: `${PLANS[purchased.plan]?.label || 'Paid'} subscription`,
      }
    }

    const codeResult = await client.query(
      `SELECT code, plan, label, uses_max, uses_count, revoked_at
         FROM access_code
        WHERE code = $1
        FOR UPDATE`,
      [codeValue],
    )
    const code = codeResult.rows[0]
    if (accessCodeUnavailable(code)) return null

    const prior = await client.query(
      `SELECT account_id FROM access_code_use WHERE code = $1 AND install_id = $2`,
      [codeValue, installId],
    )
    let accountId = prior.rows[0]?.account_id ?? null

    if (!accountId) {
      const claimed = await client.query(
        `UPDATE access_code SET uses_count = uses_count + 1
          WHERE code = $1 AND revoked_at IS NULL
            AND (uses_max IS NULL OR uses_count < uses_max)
          RETURNING uses_count`,
        [codeValue],
      )
      if (claimed.rows.length === 0) return null

      const created = await client.query(
        `INSERT INTO account (email, plan, status, install_id)
              VALUES ($1, $2, 'active', $3)
         ON CONFLICT (email) DO UPDATE SET plan = EXCLUDED.plan, status = 'active'
          RETURNING id`,
        [compAccountEmail(codeValue, installId), code.plan, installId],
      )
      accountId = created.rows[0].id
      await client.query(
        `INSERT INTO access_code_use (code, install_id, account_id) VALUES ($1,$2,$3)
         ON CONFLICT (code, install_id) DO NOTHING`,
        [codeValue, installId, accountId],
      )
    }

    // This call also runs for a prior access_code_use. That is the repair path
    // for an install redeemed by the older route before adoption was wired in.
    const { token } = await adoptInstallAndIssueDeviceToken(client, auth, {
      accountId,
      installId,
      label: code.label || 'Comp',
    })
    const accountResult = await client.query(
      `SELECT plan, status FROM account WHERE id = $1`,
      [accountId],
    )
    return {
      token,
      accountId,
      ...entitlementFor(accountResult.rows[0]),
      label: code.label ?? null,
    }
  })
}

module.exports = { redeemAccessCode, transactionResult }
