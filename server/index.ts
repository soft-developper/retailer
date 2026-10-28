import express from 'express'
import crypto from 'node:crypto'
import { createClient } from '@libsql/client'
import { initiateDeveloperControlledWalletsClient, defaultBaseUrl } from '@circle-fin/developer-controlled-wallets'
import { createAppServerKit, KitError } from '@circle-fin/app-kit/server'

const app = express()
app.use(express.json())

// ── DB ────────────────────────────────────────────────────────────────────────
const db = createClient({
  url: process.env.TURSO_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      local_currency TEXT NOT NULL DEFAULT 'USD',
      arc_wallet_address TEXT,
      circle_wallet_id TEXT,
      circle_wallet_set_id TEXT,
      fx_rate_override REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      local_price REAL NOT NULL,
      sku TEXT,
      image_url TEXT,
      units_sold INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS checkout_sessions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      amount_local REAL,
      currency TEXT,
      fx_rate REAL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      merchant_id TEXT NOT NULL,
      tx_hash TEXT,
      amount_usdc REAL NOT NULL,
      network_fee_usdc REAL,
      platform_fee_usdc REAL,
      from_address TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      confirmed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS fee_records (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      fee_type TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

// ── Circle Wallets ─────────────────────────────────────────────────────────────
let _circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null

function getCircleClient() {
  if (_circleClient) return _circleClient
  const apiKey = process.env.CIRCLE_API_KEY
  const entitySecret =
    process.env.CIRCLE_ENTITY_SECRET ??
    process.env.ENTITY_SECRET ??
    process.env.CIRCLE_SCP_ENTITY_SECRET
  if (!apiKey || !entitySecret) {
    throw new Error('Circle credentials not configured — ensure CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are set in .env')
  }
  _circleClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret, baseUrl: defaultBaseUrl })
  return _circleClient
}

// ── FX ────────────────────────────────────────────────────────────────────────
const fxCache: Record<string, { rate: number; ts: number }> = {}
const FX_TTL = 5 * 60 * 1000

async function getUsdRate(currency: string): Promise<number> {
  if (currency === 'USD') return 1
  const cached = fxCache[currency]
  if (cached && Date.now() - cached.ts < FX_TTL) return cached.rate
  try {
    const key = process.env.VITE_FX_API_KEY
    const url = `https://v6.exchangerate-api.com/v6/${key}/pair/${currency}/USD`
    const res = await fetch(url)
    const data = await res.json() as { conversion_rate?: number }
    const rate = data.conversion_rate ?? 1
    fxCache[currency] = { rate, ts: Date.now() }
    return rate
  } catch {
    return cached?.rate ?? 1
  }
}

// ── Startup credential check ──────────────────────────────────────────────────
async function warmUpCircle() {
  if (!process.env.CIRCLE_API_KEY) { console.warn('[startup] CIRCLE_API_KEY missing — wallet provisioning disabled'); return }
  const client = getCircleClient()
  try {
    await client.listWalletSets({ pageSize: 1 })
    console.log('[startup] Circle credentials verified OK')
  } catch (e: unknown) {
    const err = e as { message?: string }
    console.error('[startup] Circle credential check FAILED:', err.message)
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health
app.get('/health', (_req, res) => res.json({ ok: true }))

// FX rate
app.get('/fx/:currency', async (req, res) => {
  try {
    const rate = await getUsdRate(req.params.currency.toUpperCase())
    res.json({ currency: req.params.currency.toUpperCase(), usdRate: rate })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Create merchant
app.post('/merchants', async (req, res) => {
  try {
    const { name, category, local_currency } = req.body as {
      name: string
      category: string
      local_currency: string
    }
    if (!name || !category) return res.status(400).json({ error: 'name and category required' })
    const id = crypto.randomUUID()

    // Provision Circle developer-controlled wallet
    const circle = getCircleClient()
    const ciphertext1 = await circle.generateEntitySecretCiphertext()

    // Use raw axios for reliable wallet provisioning — SDK wrapper has a 50-char name limit
    // and doesn't surface the full error body on 400 responses
    const { default: axios } = await import('axios')
    const apiKey2 = process.env.CIRCLE_API_KEY!
    const circleHeaders = { Authorization: `Bearer ${apiKey2}`, 'Content-Type': 'application/json' }
    const wsRaw = await axios.post(
      'https://api.circle.com/v1/w3s/developer/walletSets',
      { idempotencyKey: crypto.randomUUID(), name: `r-${id.slice(0, 8)}`, entitySecretCiphertext: ciphertext1 },
      { headers: circleHeaders, validateStatus: () => true }
    )
    if (wsRaw.status !== 201 && wsRaw.status !== 200) {
      console.error('walletSet error:', JSON.stringify(wsRaw.data))
      throw new Error(`Failed to create wallet set: ${wsRaw.data?.message ?? wsRaw.status}`)
    }
    const walletSetId = (wsRaw.data?.data?.walletSet?.id ?? wsRaw.data?.walletSet?.id) as string | undefined
    if (!walletSetId) throw new Error('Failed to create wallet set')

    // 2. Create wallet — fresh ciphertext required per call
    const ciphertext2 = await circle.generateEntitySecretCiphertext()
    const wallRaw = await axios.post(
      'https://api.circle.com/v1/w3s/developer/wallets',
      { idempotencyKey: crypto.randomUUID(), blockchains: ['ARC-TESTNET'], count: 1, walletSetId, entitySecretCiphertext: ciphertext2 },
      { headers: circleHeaders, validateStatus: () => true }
    )
    if (wallRaw.status !== 201 && wallRaw.status !== 200) {
      console.error('wallet error:', JSON.stringify(wallRaw.data))
      throw new Error(`Failed to create wallet: ${wallRaw.data?.message ?? wallRaw.status}`)
    }
    const walletData = wallRaw.data?.data?.wallets?.[0] ?? wallRaw.data?.wallets?.[0]
    if (!walletData?.address) throw new Error('Failed to create wallet')
    const wallet = walletData as { id: string; address: string }

    await db.execute({
      sql: `INSERT INTO merchants (id, name, category, local_currency, arc_wallet_address, circle_wallet_id, circle_wallet_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, name, category, local_currency ?? 'USD', wallet.address, wallet.id, walletSetId],
    })

    res.json({ id, name, category, local_currency: local_currency ?? 'USD', arc_wallet_address: wallet.address })
  } catch (err) {
    console.error('POST /merchants error:', err)
    res.status(500).json({ error: String((err as Error).message) })
  }
})

// Find merchant by name (sign-in lookup)
app.get('/merchants', async (req, res) => {
  try {
    const name = (req.query.name as string | undefined)?.trim()
    if (!name) return res.status(400).json({ error: 'name query param required' })
    const rows = await db.execute({
      sql: `SELECT id, name, category, local_currency, arc_wallet_address, fx_rate_override, created_at
            FROM merchants WHERE LOWER(name) = LOWER(?) LIMIT 5`,
      args: [name],
    })
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Get merchant
app.get('/merchants/:id', async (req, res) => {
  try {
    const row = await db.execute({ sql: 'SELECT * FROM merchants WHERE id = ?', args: [req.params.id] })
    if (!row.rows.length) return res.status(404).json({ error: 'not found' })
    res.json(row.rows[0])
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Update merchant FX override
app.patch('/merchants/:id/fx', async (req, res) => {
  try {
    const { fx_rate_override } = req.body as { fx_rate_override: number | null }
    await db.execute({
      sql: 'UPDATE merchants SET fx_rate_override = ? WHERE id = ?',
      args: [fx_rate_override, req.params.id],
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Products CRUD
app.get('/merchants/:id/products', async (req, res) => {
  try {
    const rows = await db.execute({ sql: 'SELECT * FROM products WHERE merchant_id = ? ORDER BY created_at DESC', args: [req.params.id] })
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/merchants/:id/products', async (req, res) => {
  try {
    const { name, local_price, sku } = req.body as { name: string; local_price: number; sku?: string }
    const id = crypto.randomUUID()
    await db.execute({
      sql: 'INSERT INTO products (id, merchant_id, name, local_price, sku) VALUES (?, ?, ?, ?, ?)',
      args: [id, req.params.id, name, local_price, sku ?? null],
    })
    res.json({ id, merchant_id: req.params.id, name, local_price, sku: sku ?? null, units_sold: 0 })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.delete('/products/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [req.params.id] })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Checkout session
app.post('/sessions', async (req, res) => {
  try {
    const { merchant_id, amount_usdc, amount_local, currency, fx_rate } = req.body as {
      merchant_id: string
      amount_usdc: number
      amount_local?: number
      currency?: string
      fx_rate?: number
    }
    const id = crypto.randomUUID()
    const idempotency_key = crypto.randomUUID()
    const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    await db.execute({
      sql: `INSERT INTO checkout_sessions (id, merchant_id, amount_usdc, amount_local, currency, fx_rate, idempotency_key, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, merchant_id, amount_usdc, amount_local ?? null, currency ?? null, fx_rate ?? null, idempotency_key, expires_at],
    })
    res.json({ id, merchant_id, amount_usdc, expires_at })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/sessions/:id', async (req, res) => {
  try {
    const row = await db.execute({ sql: 'SELECT * FROM checkout_sessions WHERE id = ?', args: [req.params.id] })
    if (!row.rows.length) return res.status(404).json({ error: 'not found' })
    res.json(row.rows[0])
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Confirm payment (called by frontend after on-chain receipt verified)
app.post('/sessions/:id/confirm', async (req, res) => {
  try {
    const { tx_hash, from_address, network_fee_usdc, platform_fee_usdc } = req.body as {
      tx_hash: string
      from_address: string
      network_fee_usdc: number
      platform_fee_usdc: number
    }
    const sessionRow = await db.execute({ sql: 'SELECT * FROM checkout_sessions WHERE id = ?', args: [req.params.id] })
    if (!sessionRow.rows.length) return res.status(404).json({ error: 'session not found' })
    const session = sessionRow.rows[0] as {
      id: string; merchant_id: string; amount_usdc: number; status: string
    }
    if (session.status === 'CONFIRMED') return res.json({ ok: true, already: true })

    const txId = crypto.randomUUID()
    const now = new Date().toISOString()

    await db.execute({
      sql: `INSERT INTO transactions (id, session_id, merchant_id, tx_hash, amount_usdc, network_fee_usdc, platform_fee_usdc, from_address, status, confirmed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?)`,
      args: [txId, session.id, session.merchant_id, tx_hash, session.amount_usdc, network_fee_usdc, platform_fee_usdc, from_address, now],
    })
    await db.execute({
      sql: `INSERT INTO fee_records (id, transaction_id, fee_type, amount_usdc) VALUES (?, ?, 'NETWORK', ?), (?, ?, 'PLATFORM', ?)`,
      args: [crypto.randomUUID(), txId, network_fee_usdc, crypto.randomUUID(), txId, platform_fee_usdc],
    })
    await db.execute({
      sql: `UPDATE checkout_sessions SET status = 'CONFIRMED' WHERE id = ?`,
      args: [session.id],
    })
    res.json({ ok: true, transaction_id: txId })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Transactions for merchant
app.get('/merchants/:id/transactions', async (req, res) => {
  try {
    const rows = await db.execute({
      sql: `SELECT t.*, cs.currency, cs.amount_local, cs.fx_rate
            FROM transactions t
            LEFT JOIN checkout_sessions cs ON cs.id = t.session_id
            WHERE t.merchant_id = ?
            ORDER BY t.created_at DESC LIMIT 100`,
      args: [req.params.id],
    })
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Onramp ────────────────────────────────────────────────────────────────────

const onrampServer = createAppServerKit({
  onramp: {
    apiKey: process.env.CIRCLE_API_KEY!,
    // sandbox: api-test.circle.com — omit for production (defaults to api.circle.com)
    baseUrl: process.env.ONRAMP_API_BASE_URL,
    // widget origin — must match the client. Use VITE_ prefix so it's available in browser too.
    widgetBaseUrl: process.env.VITE_ONRAMP_WIDGET_BASE_URL,
    // bare hostname matching KYB for embedded card payments (not enforced in sandbox)
    referrerDomain: process.env.ONRAMP_REFERRER_DOMAIN,
  },
})

const ONRAMP_STATUS: Record<string, number> = { INPUT: 400, RATE_LIMIT: 429, NETWORK: 504, SERVICE: 502 }

// POST /onramp/sessions — mints a session for a merchant's wallet
// appUserId = merchant ID (stable opaque ID); destinationAddress = merchant's Circle wallet
app.post('/onramp/sessions', async (req, res) => {
  try {
    const { merchant_id, destination_address } = req.body as {
      merchant_id: string
      destination_address: string
    }
    if (!merchant_id || !destination_address) {
      return res.status(400).json({ error: 'merchant_id and destination_address required' })
    }

    // Verify the destination address belongs to this merchant
    const row = await db.execute({ sql: 'SELECT arc_wallet_address FROM merchants WHERE id = ?', args: [merchant_id] })
    if (!row.rows.length) return res.status(404).json({ error: 'merchant not found' })
    const storedAddress = row.rows[0].arc_wallet_address as string
    if (storedAddress.toLowerCase() !== destination_address.toLowerCase()) {
      return res.status(403).json({ error: 'destination_address does not match merchant wallet' })
    }

    const session = await onrampServer.onramp.createSession({
      appUserId: merchant_id,
      destinationAddress: destination_address,
      assets: { tokens: ['USDC'], chains: ['arc'] },
    })
    res.setHeader('Cache-Control', 'no-store')
    res.json(session)
  } catch (err) {
    if (err instanceof KitError) {
      return res.status(ONRAMP_STATUS[err.type] ?? 500).json({ error: err.message })
    }
    console.error('POST /onramp/sessions error:', err)
    res.status(500).json({ error: String((err as Error).message) })
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = 3001
initDb()
  .then(async () => {
    await warmUpCircle()
    app.listen(PORT, () => console.log(`Retailer API ready on :${PORT}`))
  })
  .catch((err) => {
    console.error('DB init failed:', err)
    process.exit(1)
  })
