// Persists the current merchant session locally
// (MVP: localStorage; replace with real auth post-MVP)

const KEY = 'retailer_merchant_id'

export function getCurrentMerchantId(): string | null {
  return localStorage.getItem(KEY)
}

export function setCurrentMerchantId(id: string): void {
  localStorage.setItem(KEY, id)
}

export function clearCurrentMerchantId(): void {
  localStorage.removeItem(KEY)
}
