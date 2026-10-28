# Retailer Security Review
**Date:** 2026-10-28  
**Scope:** Full — auth, payments, CORS, secrets, wallet provisioning, API surface, frontend  
**Status:** 7 findings (2 critical, 2 high, 2 medium, 1 low). All fixable before mainnet.

---

## Summary

The app's foundation is solid: parameterised SQL everywhere (no injection risk), httpOnly JWT cookies, bcrypt cost 12, ownership checks on every authenticated mutation, and payment status driven exclusively by `useWaitForTransactionReceipt` (no manual overrides). The critical findings are about gaps that matter specifically at mainnet scale — they would not cause data loss on testnet but would on mainnet.

---

## CRITICAL

### C-1 — `POST /sessions/confirm` is unauthenticated and accepts arbitrary data
**File:** `server/index.ts` line 389  
**Risk:** Any attacker who knows (or guesses) a session ID can call `POST /sessions/:id/confirm` with a fake `tx_hash` and mark any open checkout session as CONFIRMED in the database, without ever making a payment. The `tx_hash` is recorded but never verified onchain.  
**Impact:** Merchants receive "confirmed" transactions with no corresponding funds on Arc.  
**Fix:** Before inserting the transaction record, verify the `tx_hash` exists on Arc, moves the right USDC amount to the merchant's wallet, and has sufficient confirmations. Use a viem `publicClient` on the server:
```ts
const receipt = await publicClient.getTransactionReceipt({ hash: tx_hash })
// verify receipt.status === 'success', to/from addresses, and amount via getLogs
```
Until server-side verification is in place, this endpoint should at minimum require `requireAuth` so only the paying customer (if they are logged in) can trigger it — but for a public checkout flow the real fix is onchain verification.

### C-2 — Wallet provisioning uses hardcoded `api.circle.com` (mainnet URL) even in testnet
**File:** `server/index.ts` lines 216–230  
**Risk:** `axios.post('https://api.circle.com/v1/w3s/...')` is hardcoded. On testnet this works because the Circle testnet API is also at `api.circle.com`, but the blockchain passed is `ARC-TESTNET`. On mainnet you must pass `ARC` (not `ARC-TESTNET`). If you flip to mainnet USDC/wallets without updating the blockchain name, wallets are provisioned on the wrong chain, and merchant wallet addresses will not receive mainnet USDC.  
**Fix:** Drive the blockchain name and Circle base URL from env vars:
```ts
const CIRCLE_API_BASE = process.env.CIRCLE_API_BASE_URL ?? 'https://api.circle.com'
const WALLET_BLOCKCHAIN = process.env.CIRCLE_WALLET_BLOCKCHAIN ?? 'ARC-TESTNET'
```
Use these in both the wallet set and wallet creation calls.

---

## HIGH

### H-1 — `DELETE /products/:id` has no ownership check
**File:** `server/index.ts` line 353  
**Risk:** `requireAuth` is applied, so the caller must be logged in — but there is no check that the product belongs to the authenticated merchant. Any logged-in merchant can delete any other merchant's products by guessing a product UUID.  
**Fix:** Add an ownership check before deleting:
```ts
const product = await db.execute({ sql: 'SELECT merchant_id FROM products WHERE id = ?', args: [req.params.id] })
if (!product.rows.length) return res.status(404).json({ error: 'not found' })
if ((product.rows[0].arc_wallet_address as string) !== authedReq.merchantId)
  return res.status(403).json({ error: 'Forbidden' })
```

### H-2 — `POST /sessions` accepts any `merchant_id` without validating it exists
**File:** `server/index.ts` line 363  
**Risk:** A customer (or attacker) can create a checkout session with a non-existent `merchant_id`, or with `amount_usdc: 0` or a negative value. The session is inserted into the DB and a `CONFIRMED` call later creates a zero-value transaction record. This pollutes the merchant's transaction history and could be used to fake activity.  
**Fix:** Validate that the merchant exists and that `amount_usdc > 0`:
```ts
if (!merchant_id || amount_usdc <= 0) return res.status(400).json({ error: 'invalid amount' })
const mRow = await db.execute({ sql: 'SELECT id FROM merchants WHERE id = ?', args: [merchant_id] })
if (!mRow.rows.length) return res.status(404).json({ error: 'merchant not found' })
```

---

## MEDIUM

### M-1 — No rate limiting on auth endpoints (brute-force risk)
**File:** `server/index.ts` `/auth/login` and `/auth/register`  
**Risk:** `/auth/login` has no rate limit. An attacker can attempt unlimited password guesses against any email address. bcrypt cost 12 slows each attempt to ~300ms, giving ~3 attempts/second per IP — slow but not zero.  
**Fix:** Add `express-rate-limit` before mainnet:
```ts
import rateLimit from 'express-rate-limit'
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true })
app.post('/auth/login', authLimiter, ...)
app.post('/auth/register', authLimiter, ...)
```

### M-2 — Internal error messages leaked to the client on register
**File:** `server/index.ts` line 247  
**Risk:** `res.status(500).json({ error: String((err as Error).message) })` sends raw exception messages (including Circle API error strings, DB errors, and stack fragments) to the client on any unhandled error during registration. This leaks internal implementation details.  
**Fix:** Log the full error server-side and return a generic message to the client:
```ts
console.error('POST /auth/register error:', err)
res.status(500).json({ error: 'Registration failed. Please try again.' })
```
Apply the same pattern to all 500 handlers.

---

## LOW

### L-1 — JWT_SECRET falls back to a weak hardcoded value
**File:** `server/index.ts` line 106  
**Risk:** `process.env.JWT_SECRET ?? 'retailer-dev-secret-change-in-production'` — if `JWT_SECRET` is not set on Render, all JWTs are signed with a public, guessable secret. Anyone who reads this source on GitHub can forge a valid session cookie for any merchant ID.  
**Fix:** Make the server refuse to start if `JWT_SECRET` is missing in production:
```ts
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET must be set in production')
  process.exit(1)
}
```
Generate a strong secret: `openssl rand -hex 64`

---

## Findings requiring no code change (notes only)

- **CORS allowlist:** the Arc Studio preview origin `ixqe7n3c8rx9j749f9zkz.preview.studio.arc.io` should be removed before mainnet — it is a development-only origin with no users.
- **`VITE_FX_API_KEY` is a server-only secret but has a `VITE_` prefix:** Vite will include it in the browser bundle if it is ever imported in frontend code. It currently is only used in `server/index.ts` (safe), but the name is misleading. Consider renaming it `FX_API_KEY` on Render.
- **`GET /merchants/:id` returns `arc_wallet_address` publicly:** this is intentional (needed by the checkout page), but means any wallet address is publicly discoverable by merchant ID. Acceptable for a payment app; note it for the mainnet disclosure.

---

## Fix priority for mainnet migration

| # | Finding | Effort |
|---|---------|--------|
| 1 | C-1: Server-side tx verification | Medium (1–2 hours) |
| 2 | C-2: Env-driven blockchain/API config | Low (15 min) |
| 3 | H-1: Product delete ownership check | Low (5 min) |
| 4 | H-2: Session amount + merchant validation | Low (10 min) |
| 5 | M-1: Rate limiting on auth | Low (15 min) |
| 6 | M-2: Error message sanitisation | Low (15 min) |
| 7 | L-1: Hard-fail on missing JWT_SECRET | Low (5 min) |

Total estimated effort: **3–4 hours** before mainnet is safe to open to real users.
