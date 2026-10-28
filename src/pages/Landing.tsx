import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, QrCode, BarChart3, ArrowRight, X, Loader2, AlertCircle } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { api, type Merchant } from '../lib/api'
import { setCurrentMerchantId, getCurrentMerchantId } from '../lib/merchantStore'

function SignInModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [results, setResults] = useState<Merchant[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function search() {
    if (!name.trim()) return
    setLoading(true)
    setError('')
    setResults(null)
    try {
      const found = await api.findMerchantsByName(name.trim())
      setResults(found)
      if (found.length === 0) setError('No business found with that name. Check the spelling or sign up.')
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function signIn(merchant: Merchant) {
    setCurrentMerchantId(merchant.id)
    void navigate('/dashboard')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[rgba(15,23,42,0.06)]">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
              Sign in to your business
            </h2>
            <p className="text-xs text-[#64748b] mt-0.5">Enter your business name to continue</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[rgba(15,23,42,0.05)] text-[#64748b] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Search input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void search() }}
              placeholder="e.g. Mama Ngozi Groceries"
              className="flex-1 border border-[rgba(15,23,42,0.12)] rounded-xl px-4 py-2.5 text-sm text-[#0F172A] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
              autoFocus
            />
            <button
              onClick={() => void search()}
              disabled={loading || !name.trim()}
              className="bg-[#0F172A] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#1e293b] disabled:opacity-40 transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : 'Find'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-[#DC2626] bg-[#FEF2F2] rounded-xl px-4 py-3">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Results */}
          {results && results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#64748b] uppercase tracking-wider">Select your business</p>
              {results.map((m) => (
                <button
                  key={m.id}
                  onClick={() => signIn(m)}
                  className="w-full flex items-center justify-between gap-3 p-4 rounded-xl border border-[rgba(15,23,42,0.08)] hover:border-[#0F172A] hover:bg-[rgba(15,23,42,0.02)] transition-all text-left group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A] truncate">{m.name}</p>
                    <p className="text-xs text-[#64748b] capitalize">{m.category} · {m.local_currency}</p>
                  </div>
                  <ArrowRight size={16} className="text-[#94a3b8] group-hover:text-[#0F172A] flex-shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-[#94a3b8] text-center">
            Don't have an account?{' '}
            <button
              onClick={() => { onClose(); }}
              className="text-[#0F172A] font-medium hover:underline"
            >
              Sign up instead
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const merchantId = getCurrentMerchantId()
  const [showSignIn, setShowSignIn] = useState(false)

  return (
    <div className="min-h-dvh bg-[#FAFAF8] flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#0F172A] rounded-lg flex items-center justify-center">
            <ShoppingBag size={16} className="text-white" />
          </div>
          <span className="font-semibold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
            Retailer
          </span>
        </div>
        <div className="flex items-center gap-4">
          {!merchantId && (
            <button
              onClick={() => setShowSignIn(true)}
              className="text-sm font-medium text-[#334155] hover:text-[#0F172A] transition-colors"
            >
              Sign in
            </button>
          )}
          <button
            onClick={() => { void navigate(merchantId ? '/dashboard' : '/onboarding') }}
            className="text-sm font-medium text-[#0F172A] hover:text-[#2563EB] transition-colors"
          >
            {merchantId ? 'Dashboard' : 'Sign up'}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 bg-white border border-[rgba(15,23,42,0.08)] rounded-full px-4 py-2 mb-8 shadow-sm">
          <TokenUSDC size={16} variant="branded" />
          <span className="text-sm font-medium text-[#334155]">Powered by USDC on Arc</span>
        </div>

        <h1
          className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#0F172A] max-w-2xl text-balance leading-tight"
          style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.03em' }}
        >
          Accept digital-dollar payments anywhere
        </h1>

        <p className="mt-6 text-lg text-[#334155] max-w-lg text-pretty leading-relaxed">
          Display a QR code. Get paid in USDC. No exchange offices, no bank transfers,
          no waiting. Your customers pay from any wallet in seconds.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={() => { void navigate(merchantId ? '/dashboard' : '/onboarding') }}
            className="flex items-center gap-2 bg-[#0F172A] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1e293b] transition-colors shadow-md"
          >
            {merchantId ? 'Open dashboard' : 'Start accepting payments'}
            <ArrowRight size={16} />
          </button>
          {!merchantId && (
            <button
              onClick={() => setShowSignIn(true)}
              className="text-sm font-medium text-[#334155] hover:text-[#0F172A] transition-colors"
            >
              Already have an account? Sign in
            </button>
          )}
          {merchantId && (
            <button
              onClick={() => { void navigate('/onboarding') }}
              className="text-sm font-medium text-[#334155] hover:text-[#0F172A] transition-colors"
            >
              Register another business
            </button>
          )}
        </div>

        {/* Features */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
          {[
            {
              icon: <QrCode size={22} className="text-[#2563EB]" />,
              title: 'QR code checkout',
              desc: 'Permanent business QR or dynamic per-sale codes. Print once or generate at checkout.',
            },
            {
              icon: <TokenUSDC size={22} variant="branded" />,
              title: 'Instant settlement',
              desc: 'Payments settle on-chain in under a second. No chargebacks, no intermediaries.',
            },
            {
              icon: <BarChart3 size={22} className="text-[#2563EB]" />,
              title: 'Sales dashboard',
              desc: 'Live balance, transaction history, products, and revenue — in your local currency.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-white/80 backdrop-blur-sm border border-[rgba(15,23,42,0.06)] rounded-2xl p-6 text-left shadow-sm"
            >
              <div className="w-10 h-10 bg-[#F1F5FE] rounded-xl flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold text-[#0F172A] mb-2" style={{ fontFamily: 'Space Grotesk' }}>
                {f.title}
              </h3>
              <p className="text-sm text-[#334155] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="text-center py-6 text-xs text-[#94a3b8]">
        Retailer runs on Arc Testnet. Payments are in USDC.
      </footer>

      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
    </div>
  )
}
