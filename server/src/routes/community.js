/**
 * routes/community.js — the non-money community surfaces: feedback intake, the
 * admin feedback feed, the corpus report, and access-code redemption.
 *
 * Extracted verbatim from index.js on 2026-08-15 (the fixability order —
 * "organize it in a way that is scalable"). Behavior is byte-identical; each
 * route kept its original comment because those comments carry the WHY. Nothing
 * in this file touches reservations or model spend — that is what made it the
 * safe first extraction. Money routes stay in index.js until after the store
 * push, by explicit plan.
 *
 * deps are handed in by index.js: the shared `route` async wrapper, the `auth`
 * module (redeem issues real device tokens through it), and the redeem helpers.
 * This module registers routes and owns nothing else.
 */

function mount(app, db, { route, auth, redeemAccessCode, invalidCodeResponse }) {
  // ── Beta feedback ───────────────────────────────────────────────────────────
  /**
   * Where a tester's report actually lands.
   *
   * It used to POST to a Supabase project that has since been deleted — the host
   * does not resolve — so every submission failed and the app told nobody. Free
   * and unauthenticated on purpose: a man reporting that the app is broken must
   * not be blocked by the part of it that is broken.
   */
  app.post('/v1/feedback', route(async (req, res) => {
    const { name, category, body, version, platform } = req.body || {}
    const text = String(body ?? '').trim()
    if (!text) return res.status(400).json({ error: 'body is required' })
    if (text.length > 8000) return res.status(413).json({ error: 'that is too long to submit' })

    const CATEGORIES = new Set(['Bug', 'Feature', 'UX', 'General', 'AI Report'])
    const { rows } = await db.query(
      `INSERT INTO feedback (name, category, body, version, platform, install_id, account_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
      [
        String(name ?? '').slice(0, 120) || null,
        CATEGORIES.has(category) ? category : 'General',
        text,
        String(version ?? '').slice(0, 40) || null,
        String(platform ?? '').slice(0, 40) || null,
        req.identity.installId ?? null,
        req.identity.account?.id ?? null,
      ],
    )
    res.json({ ok: true, id: rows[0].id, createdAt: rows[0].created_at })
  }))

  /**
   * The feed, newest first.
   *
   * NOT PUBLIC. Every row is a named beta tester's free-text report about a
   * pastor's Bible-study habits, and it was readable by anyone who guessed the
   * URL. Reading it requires a comp account — which in practice means Cole, Rikki
   * or a beta code holder, since comp is not for sale.
   */
  app.get('/v1/feedback', route(async (req, res) => {
    if (!req.identity.account?.isAdmin) {
      return res.status(403).json({ error: 'FORBIDDEN' })
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const { rows } = await db.query(
      `SELECT id, created_at, name, category, body, version, platform, decision
         FROM feedback ORDER BY created_at DESC LIMIT $1`, [limit])
    res.json({ feedback: rows })
  }))

  // ── The corpus: what users' money has actually built ──────────────────────
  /**
   * What the cache knows, in a form the vault can act on.
   *
   * THE POINT. Every study a user pays for leaves a content-addressed document
   * behind, and the next person to open that passage gets it free. That is the
   * asset compounding. This endpoint is how the Foundry learns what is in it and,
   * more importantly, WHAT PEOPLE ACTUALLY STUDY — which is information Cole
   * cannot get any other way and does not currently have.
   *
   * PRIVACY IS THE WHOLE DESIGN CONSTRAINT, not a footnote.
   * - No install ids, no account ids, no emails.
   * - No questions. A man's questions about a passage are pastoral material; they
   *   are the single most sensitive thing this server holds, and they are not
   *   exported at any aggregation level.
   * - Only Scripture references and counts leave here. A reference is public;
   *   who asked about it is not.
   *
   * Comp accounts only, same as the feedback feed.
   */
  app.get('/v1/corpus', route(async (req, res) => {
    if (!req.identity.account?.isAdmin) {
      return res.status(403).json({ error: 'FORBIDDEN' })
    }

    const [demand, docs, refusals] = await Promise.all([
      // WHAT PEOPLE STUDY. Counted from the per-call ledger, which carries a
      // reference and nothing about who ran it.
      db.query(
        `SELECT reference, COUNT(DISTINCT study_id)::int AS studies
           FROM usage_event
          WHERE reference IS NOT NULL
            AND (label LIKE 'analyze%' OR label IN ('quick-study', 'guided-study'))
          GROUP BY reference
          ORDER BY studies DESC, reference
          LIMIT 200`),
      // WHAT THE CACHE HOLDS. The documents themselves are not returned — only
      // that they exist, so the vault can see coverage without pulling prose it
      // has no right to treat as scholarship.
      db.query(
        `SELECT COUNT(*)::int AS documents,
                COUNT(*) FILTER (WHERE cache_key LIKE 'analysis-cache%')::int AS analyses,
                MIN(created_at) AS first_at,
                MAX(updated_at) AS last_at
           FROM document_cache`),
      // WHERE IT FAILED OR REFUSED. The most useful signal of all, and the one a
      // success-only view hides.
      db.query(
        `SELECT state, COUNT(*)::int AS n FROM study GROUP BY state`),
    ])

    res.json({
      generatedAt: new Date().toISOString(),
      demand: demand.rows,
      cache: docs.rows[0],
      studyStates: Object.fromEntries(refusals.rows.map((r) => [r.state, r.n])),
      note: 'References and counts only. No install ids, no accounts, no questions.',
    })
  }))

  // ── Redeem an access code ─────────────────────────────────────────────────
  /**
   * Comped access, no card, no Stripe.
   *
   * Cole and Rikki must not be paying to use their own product, and Cole needs to
   * be able to hand a working copy to a beta tester or a pastor without asking for
   * a credit card first. A code creates a real account and issues a real device
   * token, so a comped user travels the identical code path as a paying one —
   * which is the only way the comped path stays tested.
   *
   * Deliberately NOT a magic build or a hidden flag in the app. A comp that lives
   * on the server can be revoked the moment a code leaks; a comp compiled into a
   * binary is permanent and public the day someone posts it.
   */
  app.post('/v1/redeem', route(async (req, res) => {
    const raw = String((req.body || {}).code || '').trim().toUpperCase()
    const installId = req.identity.installId
    if (!raw) return res.status(400).json({ error: 'code required' })
    if (!installId) return res.status(400).json({ error: 'x-install-id header required' })

    const refuse = () => res.status(404).json(invalidCodeResponse())

    const redeemed = await redeemAccessCode(db, { code: raw, installId, auth })
    if (!redeemed) return refuse()
    res.json(redeemed)
  }))
}

module.exports = { mount }
