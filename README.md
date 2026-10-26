# Retailer — USDC Payment Platform

Accept digital-dollar payments anywhere with a QR code. Merchants register, get a Circle developer-controlled wallet on Arc Testnet, and immediately start receiving USDC from any wallet-connected customer. Built with [Arc Studio](https://studio.arc.io).

## Tech stack

- **Frontend:** React 18 + Vite + Tailwind CSS + React Router v7
- **Wallet connection:** ConnectKit + wagmi v2 + viem (MetaMask, Coinbase Wallet, WalletConnect)
- **Blockchain:** Arc Testnet (USDC as native gas token, chain ID 5042002)
- **Merchant wallets:** Circle developer-controlled wallets SDK (`@circle-fin/developer-controlled-wallets`)
- **Database:** Turso (libSQL) via `@libsql/client`
- **Backend:** Express API server (port 3001, proxied via Vite `/api`)
- **FX rates:** ExchangeRate-API (live rates, 5-min cache)
- **QR codes:** `qrcode.react`

## Features

- Merchant onboarding: register a business and receive a Circle developer-controlled Arc Testnet wallet automatically
- Merchant dashboard: live USDC balance, payment history, quick stats, and product catalogue; Top Up button opens the Circle Onramp widget to buy USDC with local currency
- Permanent QR code: printable business QR linking to the merchant's checkout page; downloadable as PNG
- Dynamic QR code: per-sale QR with exact amount and 15-minute expiry
- Customer checkout: review merchant, amount (USDC + local currency), and itemised fee breakdown before approving
- Fee transparency: network fee and platform fee are disclosed and recorded separately on every transaction
- Payment verification: status driven entirely by on-chain receipt — no manual "mark as paid"
- Responsive: mobile, tablet, and desktop layouts

## Development

### Prerequisites

- Bun >= 1.0
- A Turso account (turso.tech) with a database named `retailer`
- A Circle developer account with developer-controlled wallets enabled

### Environment variables

**Frontend (Vercel):**

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | URL of your deployed Render backend, e.g. `https://retailer-api.onrender.com` |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project ID (cloud.walletconnect.com) |
| `VITE_ONRAMP_WIDGET_BASE_URL` | Onramp widget origin (`https://onramp-sandbox.arc.io` for sandbox) |

**Backend (Render):**

| Variable | Purpose |
|---|---|
| `CIRCLE_API_KEY` | Circle Standard Developer API key |
| `CIRCLE_ENTITY_SECRET` | Registered Circle entity secret (64-char hex) |
| `VITE_FX_API_KEY` | ExchangeRate-API key (exchangerate-api.com) |
| `TURSO_URL` | Turso database URL (libsql://...) |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `ONRAMP_API_BASE_URL` | Circle Onramp API base URL (`https://api-test.circle.com` for sandbox) |
| `VITE_ONRAMP_WIDGET_BASE_URL` | Onramp widget origin (same value as above — read by Express at startup) |
| `ONRAMP_REFERRER_DOMAIN` | Your Vercel app hostname, e.g. `retailer.vercel.app` |

See `.env.example` for all values. `RPC_PROXY_*` vars are Arc Studio-only and not needed in production.

### Install

```bash
bun install
```

### Run

Start the backend API server (port 3001):

```bash
bun run start
```

Start the Vite dev server (port 5173):

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Lint and typecheck

```bash
bun run check
```

## Deployment

### Backend → Render

1. Push this repo to GitHub.
2. In [Render](https://render.com), create a new **Web Service**, connect your repo.
3. Render auto-detects `render.yaml` — review and confirm the service.
4. In the Render dashboard, add every `sync: false` env var from `render.yaml` (your secrets).
5. Deploy. Note the service URL (e.g. `https://retailer-api.onrender.com`).

### Frontend → Vercel

1. In [Vercel](https://vercel.com), import the same GitHub repo.
2. Set **Framework Preset** to `Vite`, **Build Command** to `bun run build`, **Output Directory** to `dist`.
3. Add environment variables:
   - `VITE_API_URL` = your Render backend URL
   - `VITE_WALLETCONNECT_PROJECT_ID` = your WalletConnect project ID
   - `VITE_ONRAMP_WIDGET_BASE_URL` = `https://onramp-sandbox.arc.io`
4. Deploy.
5. Update `ONRAMP_REFERRER_DOMAIN` on Render to your Vercel app domain.
