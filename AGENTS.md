# Retailer — Agent Notes

## Project
USDC payment platform on Arc Testnet. Merchants accept QR-code payments; customers pay with external wallets via ConnectKit.

## Stack
- Frontend: React + Vite + Tailwind + React Router
- Backend: Bun/Express API server on port 3001, proxied via Vite `/api`
- DB: Turso (libSQL) via `@libsql/client`
- Wallets: Circle developer-controlled wallets SDK
- Chain: Arc Mainnet (chain ID 5042), USDC ERC-20 at 0x3600000000000000000000000000000000000000

## Deployed Contracts
| Contract | Network | Address |
|---|---|---|
| RetailerPayments | Arc Testnet | `0x57c211cd15131f4c43e3d808f6f8bffcbfed402a` |

- Explorer: https://explorer.testnet.arc.io/address/0x57c211cd15131f4c43e3d808f6f8bffcbfed402a
- Constructor arg: USDC `0x3600000000000000000000000000000000000000`
- Env var: `VITE_RETAILER_PAYMENTS_ADDRESS`
- Payments flow through `pay(merchant, sessionId, amount)`, emitting `PaymentReceived` for backend verification.

## Merchant Wallets
Each merchant gets a Circle developer-controlled EOA on Arc Testnet.
Wallet set ID and per-merchant wallet IDs stored in `merchants` table.

## Key Decisions
- Payment status driven by `useWaitForTransactionReceipt` only — no manual override
- Network fee + platform fee recorded separately in `fee_records` on every transaction
- FX rate snapshot recorded on every transaction at time of payment
- No blockchain jargon exposed to merchants or customers in the UI
