// Typed API client
// Dev: Vite proxies /api → localhost:3001
// Production: VITE_API_URL = https://your-backend.onrender.com

export interface Merchant {
  id: string
  name: string
  email: string
  category: string
  local_currency: string
  arc_wallet_address: string
  circle_wallet_id?: string
  fx_rate_override?: number | null
  created_at?: string
}

export interface Product {
  id: string
  merchant_id: string
  name: string
  local_price: number
  sku?: string | null
  image_url?: string | null
  units_sold: number
  created_at: string
}

export interface SessionProduct {
  product_id: string
  quantity: number
  name: string
  unit_price_local: number
}

export interface CheckoutSession {
  id: string
  merchant_id: string
  amount_usdc: number
  amount_local?: number | null
  currency?: string | null
  fx_rate?: number | null
  status: 'OPEN' | 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'FAILED'
  idempotency_key: string
  created_at: string
  expires_at: string
}

export interface Transaction {
  id: string
  session_id?: string | null
  merchant_id: string
  tx_hash?: string | null
  amount_usdc: number
  network_fee_usdc?: number | null
  platform_fee_usdc?: number | null
  from_address?: string | null
  status: 'PENDING' | 'CONFIRMED' | 'FAILED'
  confirmed_at?: string | null
  created_at: string
  currency?: string | null
  amount_local?: number | null
  fx_rate?: number | null
}

const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // send httpOnly cookies cross-origin
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  // Auth
  register: (body: { name: string; email: string; password: string; category: string; local_currency: string }) =>
    req<Merchant>('POST', '/auth/register', body),
  login: (body: { email: string; password: string }) =>
    req<Merchant>('POST', '/auth/login', body),
  logout: () => req<{ ok: boolean }>('POST', '/auth/logout'),
  me: () => req<Merchant>('GET', '/auth/me'),

  // Merchants (public read — used by checkout)
  getMerchant: (id: string) => req<Merchant>('GET', `/merchants/${id}`),
  updateFxOverride: (id: string, fx_rate_override: number | null) =>
    req<{ ok: boolean }>('PATCH', `/merchants/${id}/fx`, { fx_rate_override }),

  // Products
  getProducts: (merchantId: string) => req<Product[]>('GET', `/merchants/${merchantId}/products`),
  createProduct: (merchantId: string, body: { name: string; local_price: number; sku?: string }) =>
    req<Product>('POST', `/merchants/${merchantId}/products`, body),
  deleteProduct: (id: string) => req<{ ok: boolean }>('DELETE', `/products/${id}`),

  // Sessions
  createSession: (body: { merchant_id: string; amount_usdc: number; amount_local?: number; currency?: string; fx_rate?: number; session_products?: SessionProduct[] }) =>
    req<CheckoutSession>('POST', '/sessions', body),
  getSession: (id: string) => req<CheckoutSession>('GET', `/sessions/${id}`),
  confirmSession: (id: string, body: { tx_hash: string; from_address: string; network_fee_usdc: number; platform_fee_usdc: number }) =>
    req<{ ok: boolean; transaction_id?: string }>('POST', `/sessions/${id}/confirm`, body),

  // Transactions
  getTransactions: (merchantId: string) =>
    req<Transaction[]>('GET', `/merchants/${merchantId}/transactions`),

  // FX
  getFxRate: (currency: string) =>
    req<{ currency: string; usdRate: number }>('GET', `/fx/${currency}`),

  // Onramp
  createOnrampSession: (_merchant_id: string, destination_address: string) =>
    req<{ sessionId: string; sessionToken: string; expiresAt?: string; widgetUrl?: string }>(
      'POST', '/onramp/sessions', { destination_address }
    ),
}
