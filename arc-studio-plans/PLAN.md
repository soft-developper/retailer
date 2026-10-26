# Retailer — USDC Payment Platform

## Summary
Retailer is a merchant-facing USDC payment platform on Arc Testnet. Business owners accept payments via QR codes; each merchant is assigned a Circle developer-controlled EOA wallet. Customers pay with any external wallet (MetaMask/WalletConnect via ConnectKit). The MVP delivers merchant onboarding, the merchant dashboard, and the customer-facing QR checkout flow.

---

## Architecture

### Blockchain
Arc Testnet. USDC is the native gas token. Chain ID `5042002`.

### Payments
Direct USDC ERC-20 `transfer` from the customer's wallet to the merchant's Circle developer-controlled wallet address. Payment status is driven exclusively by on-chain receipt verification — no manual "mark as paid" path exists.

### Fee model
- **Network fee** — Arc gas cost estimated at checkout time (USDC)
- **Platform fee** — Retailer's service fee (configurable)
Both are disclosed before approval, recorded separately in `fee_records`, never silently deducted.

### Frontend
React + Vite + Tailwind. Multi-view SPA with React Router. Arc Light design mode. Fully responsive (mobile/tablet/desktop). No blockchain jargon exposed.

### Database
Turso (libSQL). Backend API server on port 3001, proxied via Vite `/api`.

### FX rates
Live rates from ExchangeRate-API, 5-min cache, merchant override supported.

---

## Database Schema

```sql
merchants        (id, name, category, local_currency, arc_wallet_address, circle_wallet_id, fx_rate_override, created_at)
products         (id, merchant_id, name, local_price, sku, image_url, units_sold, created_at)
checkout_sessions(id, merchant_id, amount_usdc, amount_local, currency, fx_rate, status, idempotency_key, created_at, expires_at)
transactions     (id, session_id, merchant_id, tx_hash, amount_usdc, network_fee_usdc, platform_fee_usdc, from_address, status, confirmed_at, created_at)
fee_records      (id, transaction_id, fee_type, amount_usdc, recorded_at)
```

---

## Payment State Machine
OPEN → PENDING → CONFIRMED | FAILED | EXPIRED

No UI path moves a session to CONFIRMED without a verified on-chain receipt.

---

## Fee Transparency Rule
Every checkout shows before approval:
1. Amount to merchant: X USDC
2. Network fee (Arc gas): ~Y USDC
3. Platform fee: Z USDC
4. **Total: X + Y + Z USDC**

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_WALLETCONNECT_PROJECT_ID` | ConnectKit / WalletConnect |
| `CIRCLE_API_KEY` | Circle developer-controlled wallets |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret (registered) |
| `VITE_FX_API_KEY` | ExchangeRate-API |
| `TURSO_URL` | Turso database URL |
| `TURSO_AUTH_TOKEN` | Turso auth token |
