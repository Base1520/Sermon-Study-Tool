const { claimAnonymousInstallData } = require('./mobile-account')

/** Adopt this install's anonymous rows before issuing its account bearer. */
async function adoptInstallAndIssueDeviceToken(client, auth, input) {
  const { accountId, installId } = input
  await claimAnonymousInstallData(client, accountId, installId)
  const issued = await auth.issueDeviceToken(client, input)
  await client.query(
    `UPDATE device SET install_data_claimed_at = now()
      WHERE id = $1 AND account_id = $2`,
    [issued.deviceId, accountId],
  )
  return issued
}

/**
 * Repair a bearer created by the old redemption path exactly once.
 *
 * auth.js supplies installId from the stored device row, never the request
 * header. Locking and re-reading that row keeps the claim bound to the bearer
 * even if revocation races this request. The marker makes every later request
 * a no-op before a transaction or adoption query is opened.
 */
async function ensureDeviceInstallDataClaimed(db, identity) {
  const accountId = identity?.account?.id
  const deviceId = identity?.deviceId
  if (!accountId || !deviceId || identity.installDataClaimedAt) return false

  const client = await db.connect()
  let finished = false
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT id, install_id, install_data_claimed_at
         FROM device
        WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL
        FOR UPDATE`,
      [deviceId, accountId],
    )
    const device = rows[0]
    if (!device || device.install_data_claimed_at || !device.install_id) {
      await client.query('ROLLBACK')
      finished = true
      return false
    }

    await claimAnonymousInstallData(client, accountId, device.install_id)
    await client.query(
      `UPDATE device SET install_data_claimed_at = now()
        WHERE account_id = $1 AND install_id = $2 AND revoked_at IS NULL`,
      [accountId, device.install_id],
    )
    await client.query('COMMIT')
    finished = true
    identity.installId = device.install_id
    identity.installDataClaimedAt = new Date()
    return true
  } catch (error) {
    if (!finished) await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

function middleware(db) {
  return (req, _res, next) => {
    ensureDeviceInstallDataClaimed(db, req.identity).then(() => next(), next)
  }
}

module.exports = {
  adoptInstallAndIssueDeviceToken,
  ensureDeviceInstallDataClaimed,
  middleware,
}
