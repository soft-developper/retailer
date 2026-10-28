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
  token?: string // returned by login/register, stored in localStorage
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

const TOKEN_KEY = 'retailer_jwt'
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get()
  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // also send cookie for same-origin dev
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  // Auth
  register: async (body: { name: string; email: string; password: string; category: string; local_currency: string }) => {
    const m = await req<Merchant>('POST', '/auth/register', body)
    if (m.token) tokenStore.set(m.token)
    return m
  },
  login: async (body: { email: string; password: string }) => {
    const m = await req<Merchant>('POST', '/auth/login', body)
    if (m.token) tokenStore.set(m.token)
    return m
  },
  logout: async () => {
    tokenStore.clear()
    return req<{ ok: boolean }>('POST', '/auth/logout')
  },
  me: () => req<Merchant>('GET', '/auth/me'),

  // Merchants (public read — used by checkout)
  getMerchant: (id: string) => req<Merchant>('GET', `/merchants/${id}`),
  updateFxOverride: (id: string, fx_rate_override: number | null) =>
    req<{ ok: boolean }>('PATCH', `/merchants/${id}/fx`, { fx_rate_override }),

  // Products
  getProducts: (merchantId: string) => req<Product[]>('GET', `/merchants/${merchantId}/products`),
  createProduct: (merchantId: string, body: { name: string; local_price: number; sku?: string }) =>
    req<Product>('POST', `/merchants/${merchantId}/products`, body),
  updateProduct: (id: string, body: { name?: string; local_price?: number; sku?: string }) =>
    req<Product>('PATCH', `/products/${id}`, body),
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
