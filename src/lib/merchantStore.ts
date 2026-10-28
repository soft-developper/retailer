// Session is driven by an httpOnly JWT cookie set by the server.
// We keep a lightweight in-memory cache of the merchant ID so components
// can read it synchronously after the first /auth/me check.

let _cachedId: string | null = null

export function getCurrentMerchantId(): string | null {
  return _cachedId
}

export function setCurrentMerchantId(id: string): void {
  _cachedId = id
}

export function clearCurrentMerchantId(): void {
  _cachedId = null
}
