import { useEffect, useRef, useState } from 'react'
import { AppKit } from '@circle-fin/app-kit'
import type { OnrampSession } from '@circle-fin/app-kit'
import { X, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import { api } from '../../lib/api'

// Widget origin must match server's VITE_ONRAMP_WIDGET_BASE_URL
const WIDGET_BASE_URL = import.meta.env.VITE_ONRAMP_WIDGET_BASE_URL as string | undefined

const kit = new AppKit({ onramp: { widgetBaseUrl: WIDGET_BASE_URL } })

interface Props {
  merchantId: string
  walletAddress: string
  onClose: () => void
}

// Popup mode: fetch session eagerly via our POST endpoint, then open the widget
// window synchronously on click. kit.onramp.fetchSession sends GET — unusable here
// because our route is POST. We call api.createOnrampSession directly instead.
export default function OnrampModal({ merchantId, walletAddress, onClose }: Props) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const sessionRef = useRef<OnrampSession | null>(null)
  const remints = useRef(0)

  async function fetchSession() {
    setPhase('loading')
    setErrorMsg('')
    try {
      const raw = await api.createOnrampSession(merchantId, walletAddress)
      // Map our API response to the OnrampSession shape the SDK expects
      const session: OnrampSession = {
        sessionId: raw.sessionId,
        sessionToken: raw.sessionToken,
        expiresAt: raw.expiresAt ?? new Date(Date.now() + 25 * 60 * 1000).toISOString(),
      }
      sessionRef.current = session
      setPhase('ready')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not prepare onramp session. Please try again.')
      setPhase('error')
    }
  }

  // Fetch session on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchSession() }, [merchantId, walletAddress])

  // openWindow MUST be called synchronously inside a click handler — no await before it
  function handleOpen() {
    const session = sessionRef.current
    if (!session) return

    const result = kit.onramp.openWindow({ session })

    if (result.status === 'blocked') {
      setErrorMsg('Your browser blocked the payment window. Allow popups for this site and try again.')
      setPhase('error')
      return
    }

    result.widget.on('DEPOSIT_SUBMITTED', () => { onClose() })
    result.widget.on('DEPOSIT_SETTLED', () => { onClose() })
    result.widget.on('DEPOSIT_NOT_COMPLETED', ({ code }) => {
      if (code === 'SESSION_TIMEOUT') {
        result.widget.close()
        if (remints.current++ > 0) {
          setErrorMsg('Session expired. Please close and try again.')
          setPhase('error')
          return
        }
        void fetchSession()
      }
      // CANCELED_BY_CUSTOMER and others: leave modal open so user can retry
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(15,23,42,0.06)]">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
              Top up USDC
            </h2>
            <p className="text-xs text-[#64748b] mt-0.5">Buy USDC with your local currency</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[rgba(15,23,42,0.05)] text-[#64748b] transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-6 flex flex-col items-center gap-5">
          {phase === 'loading' && (
            <>
              <Loader2 size={32} className="text-[#0F172A] animate-spin" />
              <p className="text-sm text-[#64748b]">Preparing your payment session…</p>
            </>
          )}

          {phase === 'error' && (
            <>
              <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center">
                <AlertCircle size={22} className="text-[#DC2626]" />
              </div>
              <p className="text-sm text-[#334155] text-center">{errorMsg}</p>
              <button
                onClick={() => { remints.current = 0; void fetchSession() }}
                className="px-4 py-2 bg-[#0F172A] text-white text-sm font-semibold rounded-xl hover:bg-[#1e293b] transition-colors"
              >
                Try again
              </button>
            </>
          )}

          {phase === 'ready' && (
            <>
              <div className="w-full bg-[#F8FAFC] rounded-xl p-4 space-y-1">
                <p className="text-xs font-medium text-[#64748b] uppercase tracking-wider">Destination wallet</p>
                <p className="text-xs font-mono text-[#0F172A] break-all">{walletAddress}</p>
              </div>

              <div className="w-full space-y-2 text-sm text-[#475569]">
                <p className="flex items-start gap-2">
                  <span className="mt-0.5 text-[#0F172A] font-bold">1.</span>
                  Click <strong>Open payment window</strong> below.
                </p>
                <p className="flex items-start gap-2">
                  <span className="mt-0.5 text-[#0F172A] font-bold">2.</span>
                  Complete the purchase in the new tab.
                </p>
                <p className="flex items-start gap-2">
                  <span className="mt-0.5 text-[#0F172A] font-bold">3.</span>
                  USDC arrives in your wallet within a few minutes.
                </p>
              </div>

              <button
                onClick={handleOpen}
                className="w-full flex items-center justify-center gap-2 bg-[#0F172A] hover:bg-[#1e293b] text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                <ExternalLink size={15} />
                Open payment window
              </button>

              <p className="text-xs text-[#94a3b8] text-center">
                Allow popups for this site if your browser prompts you.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
