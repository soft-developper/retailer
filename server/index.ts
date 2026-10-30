import express from 'express'
import crypto from 'node:crypto'
import { createClient } from '@libsql/client'
import { initiateDeveloperControlledWalletsClient, defaultBaseUrl } from '@circle-fin/developer-controlled-wallets'
import { createAppServerKit, KitError } from '@circle-fin/app-kit/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { createPublicClient, http, parseAbi, decodeEventLog } from 'viem'
import { arc } from 'viem/chains'

// ── L-1: require JWT_SECRET at startup — no insecure fallback ─────────────────
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET env var is not set. Refusing to start.')
  process.exit(1)
}

const app = express()
app.use(express.json())
app.use(cookieParser())

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .concat([
      'https://retailer-psi.vercel.app',
      'https://ixqe7n3c8rx9j749f9zkz.preview.studio.arc.io',
    ])
)

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
  // Prevent browser caching of API responses — always fetch fresh data
  res.setHeader('Cache-Control', 'no-store')
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
      tx_hash TEXT UNIQUE,
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
  // Migrate pre-auth databases
  const cols = ['email TEXT', 'password_hash TEXT']
  for (const col of cols) {
    try { await db.execute(`ALTER TABLE merchants ADD COLUMN ${col}`) } catch { /* exists */ }
  }
  // Ensure tx_hash unique index on existing DBs
  try {
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_hash ON transactions(tx_hash) WHERE tx_hash IS NOT NULL')
  } catch { /* exists */ }
  // Add session_products column for cart tracking
  try { await db.execute('ALTER TABLE checkout_sessions ADD COLUMN session_products TEXT') } catch { /* exists */ }
}

// ── JWT helpers ───────────────────────────────────────────────────────────────
const COOKIE_NAME = 'retailer_token'
// Render sets RENDER=true; also honour NODE_ENV=production
const IS_PROD = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'

function signToken(merchantId: string): string {
  return jwt.sign({ sub: merchantId }, JWT_SECRET!, { expiresIn: '30d' })
}

function setAuthCookie(res: express.Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

function getTokenFromRequest(req: express.Request): string | null {
  // 1. Bearer token in Authorization header (works cross-origin, used by production)
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  // 2. httpOnly cookie fallback (works in same-origin dev)
  return (req.cookies?.[COOKIE_NAME] as string | undefined) ?? null
}

function getMerchantIdFromRequest(req: express.Request): string | null {
  const token = getTokenFromRequest(req)
  if (!token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { sub: string }
    return payload.sub
  } catch { return null }
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const merchantId = getMerchantIdFromRequest(req)
  if (!merchantId) { res.status(401).json({ error: 'Unauthorized' }); return }
  ;(req as express.Request & { merchantId: string }).merchantId = merchantId
  next()
}

// ── C-1: onchain USDC transfer verifier ───────────────────────────────────────
// RPC URL from env — set by the proxy or by RENDER/production env vars.
// USDC_ADDRESS must be set in .env — never hardcoded.
const ARC_RPC_URL = process.env.ARC_RPC_URL
if (!ARC_RPC_URL) {
  console.warn('[startup] ARC_RPC_URL not set — onchain verification will fail')
}

const USDC_CONTRACT = (process.env.USDC_ADDRESS ?? '') as `0x${string}`
if (!USDC_CONTRACT) {
  console.warn('[startup] USDC_ADDRESS not set — onchain verification will fail')
}

// PaymentReceived(address indexed merchant, address indexed payer, bytes32 indexed sessionId, uint256 amount)
const PAYMENT_RECEIVED_ABI = parseAbi([
  'event PaymentReceived(address indexed merchant, address indexed payer, bytes32 indexed sessionId, uint256 amount)',
])

const RETAILER_PAYMENTS_CONTRACT = (process.env.VITE_RETAILER_PAYMENTS_ADDRESS ?? '') as `0x${string}`
if (!RETAILER_PAYMENTS_CONTRACT) {
  console.warn('[startup] VITE_RETAILER_PAYMENTS_ADDRESS not set — onchain verification will use Transfer fallback')
}

const publicClient = createPublicClient({
  chain: arc,
  transport: http(ARC_RPC_URL ?? ''),
})

interface VerifyResult {
  ok: boolean
  fromAddress: string
  amountUsdc: number
  error?: string
}

async function verifyUsdcTransfer(
  txHash: `0x${string}`,
  expectedTo: string,
  expectedAmountUsdc: number
): Promise<VerifyResult> {
  if (!ARC_RPC_URL) {
    return { ok: false, fromAddress: '', amountUsdc: 0, error: 'Onchain verification not configured' }
  }
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  if (!receipt) return { ok: false, fromAddress: '', amountUsdc: 0, error: 'Transaction not found' }
  if (receipt.status !== 'success') return { ok: false, fromAddress: '', amountUsdc: 0, error: 'Transaction reverted' }

  // Primary: look for PaymentReceived from the RetailerPayments contract
  if (RETAILER_PAYMENTS_CONTRACT) {
    const contractLogs = receipt.logs.filter(
      l => l.address.toLowerCase() === RETAILER_PAYMENTS_CONTRACT.toLowerCase()
    )
    for (const log of contractLogs) {
      try {
        const { args } = decodeEventLog({ abi: PAYMENT_RECEIVED_ABI, data: log.data, topics: log.topics })
        if (!args) continue
        const { merchant, payer, amount } = args as { merchant: string; payer: string; sessionId: `0x${string}`; amount: bigint }
        if (merchant.toLowerCase() !== expectedTo.toLowerCase()) continue
        const amountUsdc = Number(amount) / 1_000_000
        if (Math.abs(amountUsdc - expectedAmountUsdc) > 0.005) {
          return { ok: false, fromAddress: payer, amountUsdc, error: `Amount mismatch: got ${amountUsdc} USDC, expected ${expectedAmountUsdc}` }
        }
        return { ok: true, fromAddress: payer, amountUsdc }
      } catch { continue }
    }
  }

  // Fallback: raw USDC Transfer event (for wallets that bypass the contract)
  const transferAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])
  const usdcLogs = receipt.logs.filter(
    l => USDC_CONTRACT && l.address.toLowerCase() === USDC_CONTRACT.toLowerCase()
  )
  for (const log of usdcLogs) {
    try {
      const { args } = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics })
      if (!args) continue
      const { from, to, value } = args as { from: string; to: string; value: bigint }
      if (to.toLowerCase() !== expectedTo.toLowerCase()) continue
      const amountUsdc = Number(value) / 1_000_000
      if (Math.abs(amountUsdc - expectedAmountUsdc) > 0.005) {
        return { ok: false, fromAddress: from, amountUsdc, error: `Amount mismatch: got ${amountUsdc} USDC, expected ${expectedAmountUsdc}` }
      }
      return { ok: true, fromAddress: from, amountUsdc }
    } catch { continue }
  }

  return { ok: false, fromAddress: '', amountUsdc: 0, error: 'No matching payment event found' }
}

// ── Circle Wallets ─────────────────────────────────────────────────────────────
// C-2: ARC_BLOCKCHAIN is env-driven — 'ARC-TESTNET' for testnet, 'ARC' for mainnet
const ARC_BLOCKCHAIN = process.env.ARC_BLOCKCHAIN ?? 'ARC-TESTNET'

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

// ── M-1: rate limiters ────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
})

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registrations from this IP. Please try again later.' },
})

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post('/auth/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password, category, local_currency } = req.body as {
      name: string; email: string; password: string; category: string; local_currency?: string
    }
    if (!name?.trim() || !email?.trim() || !password || !category) {
      return res.status(400).json({ error: 'name, email, password and category are required' })
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

    const existing = await db.execute({ sql: 'SELECT id FROM merchants WHERE LOWER(email) = LOWER(?)', args: [email.trim()] })
    if (existing.rows.length) return res.status(409).json({ error: 'An account with this email already exists' })

    const password_hash = await bcrypt.hash(password, 12)
    const id = crypto.randomUUID()

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
    if (wsRaw.status !== 201 && wsRaw.status !== 200) throw new Error('Wallet provisioning failed. Please try again.')
    const walletSetId = (wsRaw.data?.data?.walletSet?.id ?? wsRaw.data?.walletSet?.id) as string | undefined
    if (!walletSetId) throw new Error('Wallet provisioning failed. Please try again.')

    const ciphertext2 = await circle.generateEntitySecretCiphertext()
    const wallRaw = await axios.post(
      'https://api.circle.com/v1/w3s/developer/wallets',
      { idempotencyKey: crypto.randomUUID(), blockchains: [ARC_BLOCKCHAIN], count: 1, walletSetId, entitySecretCiphertext: ciphertext2 },
      { headers: circleHeaders, validateStatus: () => true }
    )
    if (wallRaw.status !== 201 && wallRaw.status !== 200) throw new Error('Wallet provisioning failed. Please try again.')
    const walletData = wallRaw.data?.data?.wallets?.[0] ?? wallRaw.data?.wallets?.[0]
    if (!walletData?.address) throw new Error('Wallet provisioning failed. Please try again.')
    const wallet = walletData as { id: string; address: string }

    await db.execute({
      sql: `INSERT INTO merchants (id, name, email, password_hash, category, local_currency, arc_wallet_address, circle_wallet_id, circle_wallet_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, name.trim(), email.trim().toLowerCase(), password_hash, category, local_currency ?? 'USD', wallet.address, wallet.id, walletSetId],
    })

    const token = signToken(id)
    setAuthCookie(res, token)
    res.status(201).json({ id, name: name.trim(), email: email.trim().toLowerCase(), category, local_currency: local_currency ?? 'USD', arc_wallet_address: wallet.address, token })
  } catch (err) {
    console.error('POST /auth/register error:', err)
    // M-2: pass through user-facing messages, hide everything else
    const msg = (err as Error).message
    const safeMessages = new Set([
      'name, email, password and category are required',
      'Password must be at least 8 characters',
      'An account with this email already exists',
      'Wallet provisioning failed. Please try again.',
    ])
    const status = msg === 'An account with this email already exists' ? 409 : 500
    res.status(status).json({ error: safeMessages.has(msg) ? msg : 'Could not create your account. Please try again.' })
  }
})

app.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string }
    if (!email || !password) return res.status(400).json({ error: 'email and password required' })

    const row = await db.execute({ sql: 'SELECT * FROM merchants WHERE LOWER(email) = LOWER(?)', args: [email.trim()] })
    // Always hash to prevent timing-based user enumeration
    const dummyHash = '$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const stored = row.rows[0] as { id: string; name: string; email: string; password_hash: string; category: string; local_currency: string; arc_wallet_address: string; fx_rate_override: number | null } | undefined
    const hashToCheck = stored?.password_hash ?? dummyHash
    const valid = await bcrypt.compare(password, hashToCheck)
    if (!stored || !valid) return res.status(401).json({ error: 'Invalid email or password' })

    const token = signToken(stored.id)
    setAuthCookie(res, token)
    res.json({ id: stored.id, name: stored.name, email: stored.email, category: stored.category, local_currency: stored.local_currency, arc_wallet_address: stored.arc_wallet_address, fx_rate_override: stored.fx_rate_override, token })
  } catch (err) {
    console.error('POST /auth/login error:', err)
    res.status(500).json({ error: 'Login failed. Please try again.' })
  }
})

app.post('/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/', sameSite: IS_PROD ? 'none' : 'lax', secure: IS_PROD })
  res.json({ ok: true })
})

app.get('/auth/me', async (req, res) => {
  const merchantId = getMerchantIdFromRequest(req)
  if (!merchantId) return res.status(401).json({ error: 'Not logged in' })
  try {
    const row = await db.execute({ sql: 'SELECT id, name, email, category, local_currency, arc_wallet_address, fx_rate_override, created_at FROM merchants WHERE id = ?', args: [merchantId] })
    if (!row.rows.length) return res.status(404).json({ error: 'Merchant not found' })
    res.json(row.rows[0])
  } catch (err) {
    console.error('GET /auth/me error:', err)
    res.status(500).json({ error: 'Session check failed.' })
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

app.get('/merchants/:id', async (req, res) => {
  try {
    const row = await db.execute({ sql: 'SELECT id, name, category, local_currency, arc_wallet_address, fx_rate_override FROM merchants WHERE id = ?', args: [req.params.id] })
    if (!row.rows.length) return res.status(404).json({ error: 'not found' })
    res.json(row.rows[0])
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/merchants', async (req, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim() ?? ''
    if (!q) return res.json([])
    const rows = await db.execute({
      sql: `SELECT id, name, category FROM merchants WHERE LOWER(name) LIKE LOWER(?) LIMIT 10`,
      args: [`%${q}%`],
    })
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

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
    if (!name?.trim() || typeof local_price !== 'number' || local_price <= 0) {
      return res.status(400).json({ error: 'name and a positive local_price are required' })
    }
    const id = crypto.randomUUID()
    await db.execute({ sql: 'INSERT INTO products (id, merchant_id, name, local_price, sku) VALUES (?, ?, ?, ?, ?)', args: [id, req.params.id, name.trim(), local_price, sku ?? null] })
    res.json({ id, merchant_id: req.params.id, name: name.trim(), local_price, sku: sku ?? null, units_sold: 0 })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// H-1: ownership check — verify product belongs to the authenticated merchant
app.patch('/products/:id', requireAuth, async (req, res) => {
  const authedReq = req as express.Request & { merchantId: string }
  try {
    const { name, local_price, sku } = req.body as { name?: string; local_price?: number; sku?: string }
    if (local_price !== undefined && (typeof local_price !== 'number' || local_price <= 0)) {
      return res.status(400).json({ error: 'local_price must be a positive number' })
    }
    const row = await db.execute({ sql: 'SELECT merchant_id FROM products WHERE id = ?', args: [req.params.id] })
    if (!row.rows.length) return res.status(404).json({ error: 'Product not found' })
    const product = row.rows[0] as { merchant_id: string }
    if (product.merchant_id !== authedReq.merchantId) return res.status(403).json({ error: 'Forbidden' })
    const updates: string[] = []
    const args: (string | number)[] = []
    if (name !== undefined) { updates.push('name = ?'); args.push(name.trim()) }
    if (local_price !== undefined) { updates.push('local_price = ?'); args.push(local_price) }
    if (sku !== undefined) { updates.push('sku = ?'); args.push(sku.trim()) }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' })
    args.push(req.params.id)
    await db.execute({ sql: `UPDATE products SET ${updates.join(', ')} WHERE id = ?`, args })
    const updated = await db.execute({ sql: 'SELECT * FROM products WHERE id = ?', args: [req.params.id] })
    res.json(updated.rows[0])
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.delete('/products/:id', requireAuth, async (req, res) => {
  const authedReq = req as express.Request & { merchantId: string }
  try {
    const row = await db.execute({ sql: 'SELECT merchant_id FROM products WHERE id = ?', args: [req.params.id] })
    if (!row.rows.length) return res.status(404).json({ error: 'Product not found' })
    const product = row.rows[0] as { merchant_id: string }
    if (product.merchant_id !== authedReq.merchantId) return res.status(403).json({ error: 'Forbidden' })
    await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [req.params.id] })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// H-2: validate merchant exists + amount_usdc > 0
app.post('/sessions', async (req, res) => {
  try {
    const { merchant_id, amount_usdc, amount_local, currency, fx_rate, session_products } = req.body as {
      merchant_id: string; amount_usdc: number; amount_local?: number; currency?: string; fx_rate?: number
      session_products?: Array<{ product_id: string; quantity: number; name: string; unit_price_local: number }>
    }
    if (!merchant_id || typeof amount_usdc !== 'number' || amount_usdc <= 0) {
      return res.status(400).json({ error: 'merchant_id and a positive amount_usdc are required' })
    }
    const mRow = await db.execute({ sql: 'SELECT id FROM merchants WHERE id = ?', args: [merchant_id] })
    if (!mRow.rows.length) return res.status(404).json({ error: 'Merchant not found' })

    const id = crypto.randomUUID()
    const idempotency_key = crypto.randomUUID()
    const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const productsJson = session_products?.length ? JSON.stringify(session_products) : null
    await db.execute({
      sql: `INSERT INTO checkout_sessions (id, merchant_id, amount_usdc, amount_local, currency, fx_rate, idempotency_key, expires_at, session_products) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, merchant_id, amount_usdc, amount_local ?? null, currency ?? null, fx_rate ?? null, idempotency_key, expires_at, productsJson],
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

// C-1: verify USDC Transfer event onchain before recording payment
app.post('/sessions/:id/confirm', async (req, res) => {
  try {
    const { tx_hash, network_fee_usdc, platform_fee_usdc } = req.body as {
      tx_hash: string; network_fee_usdc: number; platform_fee_usdc: number
    }
    if (!tx_hash || !tx_hash.startsWith('0x')) {
      return res.status(400).json({ error: 'tx_hash required' })
    }

    const sessionRow = await db.execute({ sql: 'SELECT * FROM checkout_sessions WHERE id = ?', args: [req.params.id] })
    if (!sessionRow.rows.length) return res.status(404).json({ error: 'session not found' })
    const session = sessionRow.rows[0] as { id: string; merchant_id: string; amount_usdc: number; status: string }
    if (session.status === 'CONFIRMED') return res.json({ ok: true, already: true })

    // Idempotency: reject duplicate tx_hash
    const dupCheck = await db.execute({ sql: 'SELECT id FROM transactions WHERE tx_hash = ?', args: [tx_hash] })
    if (dupCheck.rows.length) return res.status(409).json({ error: 'Transaction already recorded' })

    const mRow = await db.execute({ sql: 'SELECT arc_wallet_address FROM merchants WHERE id = ?', args: [session.merchant_id] })
    if (!mRow.rows.length) return res.status(404).json({ error: 'merchant not found' })
    const merchantAddress = mRow.rows[0].arc_wallet_address as string

    // Verify onchain — rejects any fake or wrong-amount tx_hash
    const verification = await verifyUsdcTransfer(tx_hash as `0x${string}`, merchantAddress, session.amount_usdc)
    if (!verification.ok) {
      console.warn(`[confirm] onchain verification failed for session ${session.id}: ${verification.error}`)
      return res.status(422).json({ error: `Payment verification failed: ${verification.error}` })
    }

    const txId = crypto.randomUUID()
    const now = new Date().toISOString()
    await db.execute({
      sql: `INSERT INTO transactions (id, session_id, merchant_id, tx_hash, amount_usdc, network_fee_usdc, platform_fee_usdc, from_address, status, confirmed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?)`,
      args: [txId, session.id, session.merchant_id, tx_hash, session.amount_usdc, network_fee_usdc ?? 0, platform_fee_usdc ?? 0, verification.fromAddress, now],
    })
    await db.execute({
      sql: `INSERT INTO fee_records (id, transaction_id, fee_type, amount_usdc) VALUES (?, ?, 'NETWORK', ?), (?, ?, 'PLATFORM', ?)`,
      args: [crypto.randomUUID(), txId, network_fee_usdc ?? 0, crypto.randomUUID(), txId, platform_fee_usdc ?? 0],
    })
    await db.execute({ sql: `UPDATE checkout_sessions SET status = 'CONFIRMED' WHERE id = ?`, args: [session.id] })

    // Increment units_sold for each product in the cart
    const fullSession = await db.execute({ sql: 'SELECT session_products FROM checkout_sessions WHERE id = ?', args: [session.id] })
    const productsJson = fullSession.rows[0]?.session_products as string | null
    if (productsJson) {
      try {
        const items = JSON.parse(productsJson) as Array<{ product_id: string; quantity: number }>
        for (const item of items) {
          if (item.product_id && item.quantity > 0) {
            await db.execute({
              sql: 'UPDATE products SET units_sold = units_sold + ? WHERE id = ?',
              args: [item.quantity, item.product_id],
            })
          }
        }
      } catch { /* malformed json — skip */ }
    }

    res.json({ ok: true, transaction_id: txId })
  } catch (err) {
    console.error('POST /sessions/:id/confirm error:', err)
    res.status(500).json({ error: 'Could not confirm payment. Please try again.' })
  }
})

app.get('/merchants/:id/transactions', requireAuth, async (req, res) => {
  const authedReq = req as express.Request & { merchantId: string }
  if (authedReq.merchantId !== req.params.id) return res.status(403).json({ error: 'Forbidden' })
  try {
    const rows = await db.execute({
      sql: `SELECT t.*, cs.currency, cs.amount_local, cs.fx_rate FROM transactions t
            LEFT JOIN checkout_sessions cs ON cs.id = t.session_id
            WHERE t.merchant_id = ? ORDER BY t.created_at DESC LIMIT 100`,
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
    if (storedAddress.toLowerCase() !== destination_address.toLowerCase()) {
      return res.status(403).json({ error: 'destination_address does not match merchant wallet' })
    }

    const session = await onrampServer.onramp.createSession({
      appUserId: merchantId,
      destinationAddress: destination_address,
      assets: { tokens: ['USDC'], chains: ['arc'] },
    })
    res.setHeader('Cache-Control', 'no-store')
    res.json(session)
  } catch (err) {
    if (err instanceof KitError) return res.status(ONRAMP_STATUS[err.type] ?? 500).json({ error: err.message })
    console.error('POST /onramp/sessions error:', err)
    res.status(500).json({ error: 'Could not create onramp session.' })
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3001)
initDb()
  .then(async () => {
    await warmUpCircle()
    app.listen(PORT, () => console.log(`Retailer API ready on :${PORT}`))
  })
  .catch((err) => { console.error('DB init failed:', err); process.exit(1) })
