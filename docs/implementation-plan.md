Good additions. Let me update the plan to fold in the UI direction, database layer, and fee transparency requirements. Good. Now I have everything I need to update the plan. Plan mode is read-only, so the plan document lives in memory for now. The build agent will write the final `PLAN.md` when you switch to Build mode. Here is the complete updated plan:

---

## Retailer — Complete Plan (Updated)

### What changed from the first version
- Added Turso (libSQL) as the persistence layer with a full database schema
- Added the fee transparency rule as a non-negotiable build constraint with explicit DB recording
- Expanded the UI section: responsive breakpoints, cashier mode, typography rules, motion spec
- Mapped all 9 system components to their responsibilities
- Payment state machine formalised with 5 states and no bypass path

### The full database schema

```
merchants        (id, name, category, local_currency, arc_wallet_address, circle_wallet_id, fx_rate_override, created_at)
products         (id, merchant_id, name, local_price, sku, image_url, units_sold, created_at)
checkout_sessions(id, merchant_id, amount_usdc, amount_local, currency, fx_rate, status, idempotency_key, created_at, expires_at)
transactions     (id, session_id, merchant_id, tx_hash, amount_usdc, network_fee_usdc, platform_fee_usdc, from_address, status, confirmed_at, created_at)
fee_records      (id, transaction_id, fee_type, amount_usdc, recorded_at)
```

### The fee rule (hardcoded into the spec)
Every checkout shows these four lines before the customer can approve:
1. Amount to merchant: X USDC
2. Network fee (Arc gas): ~Y USDC
3. Platform fee: Z USDC
4. **Total you pay: X + Y + Z USDC**

The merchant always receives exactly X. Both fees are stored in `fee_records` on every confirmed transaction. No silent deductions.

---

### Credentials you need to gather before switching to Build mode

| Variable | Source |
|---|---|
| `VITE_WALLETCONNECT_PROJECT_ID` | cloud.walletconnect.com — free |
| `CIRCLE_API_KEY` | console.circle.com — developer-controlled wallets, Arc Testnet |
| `ENTITY_SECRET` | Generated and registered via Arc Studio during build (testnet only, you confirm first) |
| `VITE_FX_API_KEY` | exchangerate-api.com — free tier |
| `TURSO_URL` + `TURSO_AUTH_TOKEN` | turso.tech — free tier, create a DB named `retailer` |

Once you have those, switch to Build mode and we start. The build will run in the sequence: DB setup → routing → wallet provisioning → FX → payment engine → onboarding → dashboard → QR → checkout → confirmed screen → polish.
