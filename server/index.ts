import express from 'express'
import crypto from 'node:crypto'
import { createClient } from '@libsql/client'
import { initiateDeveloperControlledWalletsClient, defaultBaseUrl } from '@circle-fin/developer-controlled-wallets'
import { createAppServerKit, KitError } from '@circle-fin/app-kit/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser'

const app = express()
app.use(express.json())
app.use(cookieParser())

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://retailer-psi.vercel.app',
  'https://ixqe7n3c8rx9j749f9zkz.preview.studio.arc.io',
])
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  if (req.method === 'OPTIONS') { res.sendStatus(204); return }
  next()
})

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
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
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
  // Add columns to existing databases that predate auth
  const cols = ['email TEXT', 'password_hash TEXT']
  for (const col of cols) {
    try {
      await db.execute(`ALTER TABLE merchants ADD COLUMN ${col}`)
    } catch { /* column already exists */ }
  }
}

// ── JWT helpers ───────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET ?? 'retailer-dev-secret-change-in-production'
const COOKIE_NAME = 'retailer_token'
const IS_PROD = process.env.NODE_ENV === 'production'

function signToken(merchantId: string): string {
  return jwt.sign({ sub: merchantId }, JWT_SECRET, { expiresIn: '30d' })
}

function setAuthCookie(res: express.Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  })
}

function getMerchantIdFromCookie(req: express.Request): string | null {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined
  if (!token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string }
    return payload.sub
  } catch {
    return null
  }
}

// Auth middleware — attaches merchantId to req if valid cookie present
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const merchantId = getMerchantIdFromCookie(req)
  if (!merchantId) { res.status(401).json({ error: 'Unauthorized' }); return }
  ;(req as express.Request & { merchantId: string }).merchantId = merchantId
  next()
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
  if (!apiKey || !entitySecret) throw new Error('Circle credentials not configured')
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
    const res = await fetch(`https://v6.exchangerate-api.com/v6/${key}/pair/${currency}/USD`)
    const data = await res.json() as { conversion_rate?: number }
    const rate = data.conversion_rate ?? 1
    fxCache[currency] = { rate, ts: Date.now() }
    return rate
  } catch {
    return cached?.rate ?? 1
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────
async function warmUpCircle() {
  if (!process.env.CIRCLE_API_KEY) { console.warn('[startup] CIRCLE_API_KEY missing'); return }
  try {
    await getCircleClient().listWalletSets({ pageSize: 1 })
    console.log('[startup] Circle credentials verified OK')
  } catch (e: unknown) {
    console.error('[startup] Circle check FAILED:', (e as Error).message)
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────────

// POST /auth/register — create account + provision wallet
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, category, local_currency } = req.body as {
      name: string; email: string; password: string; category: string; local_currency?: string
    }
    if (!name?.trim() || !email?.trim() || !password || !category) {
      return res.status(400).json({ error: 'name, email, password and category are required' })
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

    // Check email not already registered
    const existing = await db.execute({ sql: 'SELECT id FROM merchants WHERE LOWER(email) = LOWER(?)', args: [email.trim()] })
    if (existing.rows.length) return res.status(409).json({ error: 'An account with this email already exists' })

    const password_hash = await bcrypt.hash(password, 12)
    const id = crypto.randomUUID()

    // Provision Circle developer-controlled wallet
    const circle = getCircleClient()
    const ciphertext1 = await circle.generateEntitySecretCiphertext()
    const { default: axios } = await import('axios')
    const apiKey = process.env.CIRCLE_API_KEY!
    const circleHeaders = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

    const wsRaw = await axios.post(
      'https://api.circle.com/v1/w3s/developer/walletSets',
      { idempotencyKey: crypto.randomUUID(), name: `r-${id.slice(0, 8)}`, entitySecretCiphertext: ciphertext1 },
      { headers: circleHeaders, validateStatus: () => true }
    )
    if (wsRaw.status !== 201 && wsRaw.status !== 200) throw new Error(`Wallet set failed: ${wsRaw.data?.message ?? wsRaw.status}`)
    const walletSetId = (wsRaw.data?.data?.walletSet?.id ?? wsRaw.data?.walletSet?.id) as string | undefined
    if (!walletSetId) throw new Error('Failed to create wallet set')

    const ciphertext2 = await circle.generateEntitySecretCiphertext()
    const wallRaw = await axios.post(
      'https://api.circle.com/v1/w3s/developer/wallets',
      { idempotencyKey: crypto.randomUUID(), blockchains: ['ARC-TESTNET'], count: 1, walletSetId, entitySecretCiphertext: ciphertext2 },
      { headers: circleHeaders, validateStatus: () => true }
    )
    if (wallRaw.status !== 201 && wallRaw.status !== 200) throw new Error(`Wallet failed: ${wallRaw.data?.message ?? wallRaw.status}`)
    const walletData = wallRaw.data?.data?.wallets?.[0] ?? wallRaw.data?.wallets?.[0]
    if (!walletData?.address) throw new Error('Failed to create wallet')
    const wallet = walletData as { id: string; address: string }

    await db.execute({
      sql: `INSERT INTO merchants (id, name, email, password_hash, category, local_currency, arc_wallet_address, circle_wallet_id, circle_wallet_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, name.trim(), email.trim().toLowerCase(), password_hash, category, local_currency ?? 'USD', wallet.address, wallet.id, walletSetId],
    })

    const token = signToken(id)
    setAuthCookie(res, token)
    res.status(201).json({ id, name: name.trim(), email: email.trim().toLowerCase(), category, local_currency: local_currency ?? 'USD', arc_wallet_address: wallet.address })
  } catch (err) {
    console.error('POST /auth/register error:', err)
    res.status(500).json({ error: String((err as Error).message) })
  }
})

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string }
    if (!email || !password) return res.status(400).json({ error: 'email and password required' })

    const row = await db.execute({ sql: 'SELECT * FROM merchants WHERE LOWER(email) = LOWER(?)', args: [email.trim()] })
    if (!row.rows.length) return res.status(401).json({ error: 'Invalid email or password' })

    const merchant = row.rows[0] as { id: string; name: string; email: string; password_hash: string; category: string; local_currency: string; arc_wallet_address: string; fx_rate_override: number | null }
    if (!merchant.password_hash) return res.status(401).json({ error: 'This account was created before passwords were added. Please contact support.' })

    const valid = await bcrypt.compare(password, merchant.password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' })

    const token = signToken(merchant.id)
    setAuthCookie(res, token)
    res.json({ id: merchant.id, name: merchant.name, email: merchant.email, category: merchant.category, local_currency: merchant.local_currency, arc_wallet_address: merchant.arc_wallet_address, fx_rate_override: merchant.fx_rate_override })
  } catch (err) {
    res.status(500).json({ error: String((err as Error).message) })
  }
})

// POST /auth/logout
app.post('/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/', sameSite: IS_PROD ? 'none' : 'lax', secure: IS_PROD })
  res.json({ ok: true })
})

// GET /auth/me — returns the logged-in merchant (used on app load to restore session)
app.get('/auth/me', async (req, res) => {
  const merchantId = getMerchantIdFromCookie(req)
  if (!merchantId) return res.status(401).json({ error: 'Not logged in' })
  try {
    const row = await db.execute({ sql: 'SELECT id, name, email, category, local_currency, arc_wallet_address, fx_rate_override, created_at FROM merchants WHERE id = ?', args: [merchantId] })
    if (!row.rows.length) return res.status(404).json({ error: 'Merchant not found' })
    res.json(row.rows[0])
  } catch (err) {
    res.status(500).json({ error: String((err as Error).message) })
  }
})

// ── Other routes ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }))

app.get('/fx/:currency', async (req, res) => {
  try {
    const rate = await getUsdRate(req.params.currency.toUpperCase())
    res.json({ currency: req.params.currency.toUpperCase(), usdRate: rate })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /merchants/:id — public (used by checkout page for customer-facing view)
app.get('/merchants/:id', async (req, res) => {
  try {
    const row = await db.execute({ sql: 'SELECT id, name, category, local_currency, arc_wallet_address, fx_rate_override FROM merchants WHERE id = ?', args: [req.params.id] })
    if (!row.rows.length) return res.status(404).json({ error: 'not found' })
    res.json(row.rows[0])
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /merchants/:id/fx — requires auth + ownership
app.patch('/merchants/:id/fx', requireAuth, async (req, res) => {
  const authedReq = req as express.Request & { merchantId: string }
  if (authedReq.merchantId !== req.params.id) return res.status(403).json({ error: 'Forbidden' })
  try {
    const { fx_rate_override } = req.body as { fx_rate_override: number | null }
    await db.execute({ sql: 'UPDATE merchants SET fx_rate_override = ? WHERE id = ?', args: [fx_rate_override, req.params.id] })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Products
app.get('/merchants/:id/products', async (req, res) => {
  try {
    const rows = await db.execute({ sql: 'SELECT * FROM products WHERE merchant_id = ? ORDER BY created_at DESC', args: [req.params.id] })
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/merchants/:id/products', requireAuth, async (req, res) => {
  const authedReq = req as express.Request & { merchantId: string }
  if (authedReq.merchantId !== req.params.id) return res.status(403).json({ error: 'Forbidden' })
  try {
    const { name, local_price, sku } = req.body as { name: string; local_price: number; sku?: string }
    const id = crypto.randomUUID()
    await db.execute({ sql: 'INSERT INTO products (id, merchant_id, name, local_price, sku) VALUES (?, ?, ?, ?, ?)', args: [id, req.params.id, name, local_price, sku ?? null] })
    res.json({ id, merchant_id: req.params.id, name, local_price, sku: sku ?? null, units_sold: 0 })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.delete('/products/:id', requireAuth, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [req.params.id] })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Checkout sessions — public (customers create them via QR link)
app.post('/sessions', async (req, res) => {
  try {
    const { merchant_id, amount_usdc, amount_local, currency, fx_rate } = req.body as { merchant_id: string; amount_usdc: number; amount_local?: number; currency?: string; fx_rate?: number }
    const id = crypto.randomUUID()
    const idempotency_key = crypto.randomUUID()
    const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    await db.execute({
      sql: `INSERT INTO checkout_sessions (id, merchant_id, amount_usdc, amount_local, currency, fx_rate, idempotency_key, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

app.post('/sessions/:id/confirm', async (req, res) => {
  try {
    const { tx_hash, from_address, network_fee_usdc, platform_fee_usdc } = req.body as { tx_hash: string; from_address: string; network_fee_usdc: number; platform_fee_usdc: number }
    const sessionRow = await db.execute({ sql: 'SELECT * FROM checkout_sessions WHERE id = ?', args: [req.params.id] })
    if (!sessionRow.rows.length) return res.status(404).json({ error: 'session not found' })
    const session = sessionRow.rows[0] as { id: string; merchant_id: string; amount_usdc: number; status: string }
    if (session.status === 'CONFIRMED') return res.json({ ok: true, already: true })
    const txId = crypto.randomUUID()
    const now = new Date().toISOString()
    await db.execute({
      sql: `INSERT INTO transactions (id, session_id, merchant_id, tx_hash, amount_usdc, network_fee_usdc, platform_fee_usdc, from_address, status, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?)`,
      args: [txId, session.id, session.merchant_id, tx_hash, session.amount_usdc, network_fee_usdc, platform_fee_usdc, from_address, now],
    })
    await db.execute({
      sql: `INSERT INTO fee_records (id, transaction_id, fee_type, amount_usdc) VALUES (?, ?, 'NETWORK', ?), (?, ?, 'PLATFORM', ?)`,
      args: [crypto.randomUUID(), txId, network_fee_usdc, crypto.randomUUID(), txId, platform_fee_usdc],
    })
    await db.execute({ sql: `UPDATE checkout_sessions SET status = 'CONFIRMED' WHERE id = ?`, args: [session.id] })
    res.json({ ok: true, transaction_id: txId })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/merchants/:id/transactions', requireAuth, async (req, res) => {
  const authedReq = req as express.Request & { merchantId: string }
  if (authedReq.merchantId !== req.params.id) return res.status(403).json({ error: 'Forbidden' })
  try {
    const rows = await db.execute({
      sql: `SELECT t.*, cs.currency, cs.amount_local, cs.fx_rate FROM transactions t LEFT JOIN checkout_sessions cs ON cs.id = t.session_id WHERE t.merchant_id = ? ORDER BY t.created_at DESC LIMIT 100`,
      args: [req.params.id],
    })
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Onramp ────────────────────────────────────────────────────────────────────
function parseReferrerDomain(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
    return host || undefined
  } catch { return undefined }
}

const onrampServer = createAppServerKit({
  onramp: {
    apiKey: process.env.CIRCLE_API_KEY!,
    baseUrl: process.env.ONRAMP_API_BASE_URL,
    widgetBaseUrl: process.env.VITE_ONRAMP_WIDGET_BASE_URL,
    referrerDomain: parseReferrerDomain(process.env.ONRAMP_REFERRER_DOMAIN),
  },
})

const ONRAMP_STATUS: Record<string, number> = { INPUT: 400, RATE_LIMIT: 429, NETWORK: 504, SERVICE: 502 }

app.post('/onramp/sessions', requireAuth, async (req, res) => {
  const authedReq = req as express.Request & { merchantId: string }
  try {
    const { destination_address } = req.body as { destination_address: string }
    const merchantId = authedReq.merchantId
    if (!destination_address) return res.status(400).json({ error: 'destination_address required' })

    const row = await db.execute({ sql: 'SELECT arc_wallet_address FROM merchants WHERE id = ?', args: [merchantId] })
    if (!row.rows.length) return res.status(404).json({ error: 'merchant not found' })
    const storedAddress = row.rows[0].arc_wallet_address as string
    if (storedAddress.toLowerCase() !== destination_address.toLowerCase()) return res.status(403).json({ error: 'destination_address does not match merchant wallet' })

    const session = await onrampServer.onramp.createSession({ appUserId: merchantId, destinationAddress: destination_address, assets: { tokens: ['USDC'], chains: ['arc'] } })
    res.setHeader('Cache-Control', 'no-store')
    res.json(session)
  } catch (err) {
    if (err instanceof KitError) return res.status(ONRAMP_STATUS[err.type] ?? 500).json({ error: err.message })
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
  .catch((err) => { console.error('DB init failed:', err); process.exit(1) })
