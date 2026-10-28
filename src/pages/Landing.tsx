import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, QrCode, BarChart3, ArrowRight, Eye, EyeOff, X } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { api } from '../lib/api'
import { setCurrentMerchantId, getCurrentMerchantId } from '../lib/merchantStore'
import { toast } from 'sonner'

interface Props {
  authReady: boolean
}

export default function Landing({ authReady }: Props) {
  const navigate = useNavigate()
  const merchantId = getCurrentMerchantId()

  const [showSignIn, setShowSignIn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      const merchant = await api.login({ email, password })
      setCurrentMerchantId(merchant.id)
      void navigate('/dashboard')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('401')) {
        toast.error('Incorrect email or password.')
      } else {
        toast.error('Sign in failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Show nothing until auth check completes — prevents flash of wrong CTA
  if (!authReady) return <div className="min-h-dvh bg-[#FAFAF8]" />

  return (
    <div className="min-h-dvh bg-[#FAFAF8] flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#0F172A] rounded-lg flex items-center justify-center">
            <ShoppingBag size={16} className="text-white" />
          </div>
          <span className="font-semibold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>Retailer</span>
        </div>
        {merchantId ? (
          <button
            onClick={() => { void navigate('/dashboard') }}
            className="text-sm font-medium text-[#0F172A] hover:text-[#2563EB] transition-colors"
          >
            Dashboard
          </button>
        ) : (
          <button
            onClick={() => setShowSignIn(true)}
            className="text-sm font-medium text-[#0F172A] hover:text-[#2563EB] transition-colors"
          >
            Sign in
          </button>
        )}
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
          {merchantId ? (
            <button
              onClick={() => { void navigate('/dashboard') }}
              className="flex items-center gap-2 bg-[#0F172A] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1e293b] transition-colors shadow-md"
            >
              Open dashboard <ArrowRight size={16} />
            </button>
          ) : (
            <>
              <button
                onClick={() => { void navigate('/onboarding') }}
                className="flex items-center gap-2 bg-[#0F172A] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1e293b] transition-colors shadow-md"
              >
                Start accepting payments <ArrowRight size={16} />
              </button>
              <button
                onClick={() => setShowSignIn(true)}
                className="text-sm font-medium text-[#334155] hover:text-[#0F172A] transition-colors"
              >
                Already have an account? Sign in
              </button>
            </>
          )}
        </div>

        {/* Features */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
          {[
            { icon: <QrCode size={22} className="text-[#2563EB]" />, title: 'QR code checkout', desc: 'Permanent business QR or dynamic per-sale codes. Print once or generate at checkout.' },
            { icon: <TokenUSDC size={22} variant="branded" />, title: 'Instant settlement', desc: 'Payments settle on-chain in under a second. No chargebacks, no intermediaries.' },
            { icon: <BarChart3 size={22} className="text-[#2563EB]" />, title: 'Sales dashboard', desc: 'Live balance, transaction history, products, and revenue — in your local currency.' },
          ].map((f) => (
            <div key={f.title} className="bg-white/80 backdrop-blur-sm border border-[rgba(15,23,42,0.06)] rounded-2xl p-6 text-left shadow-sm">
              <div className="w-10 h-10 bg-[#F1F5FE] rounded-xl flex items-center justify-center mb-4">{f.icon}</div>
              <h3 className="font-semibold text-[#0F172A] mb-2" style={{ fontFamily: 'Space Grotesk' }}>{f.title}</h3>
              <p className="text-sm text-[#334155] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="text-center py-6 text-xs text-[#94a3b8]">
        Retailer runs on Arc Testnet. Payments are in USDC.
      </footer>

      {/* Sign-in modal */}
      {showSignIn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSignIn(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 relative">
            <button
              onClick={() => setShowSignIn(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#94a3b8] hover:text-[#334155] hover:bg-[rgba(15,23,42,0.05)] transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-[#0F172A] rounded-lg flex items-center justify-center">
                <ShoppingBag size={15} className="text-white" />
              </div>
              <span className="font-semibold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>Sign in to Retailer</span>
            </div>

            <form onSubmit={(e) => { void handleSignIn(e) }} className="space-y-3">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-[rgba(15,23,42,0.12)] bg-[#FAFAF8] text-[#0F172A] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-all"
              />
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-[rgba(15,23,42,0.12)] bg-[#FAFAF8] text-[#0F172A] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b]"
                >
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

              <button
                type="submit"
                disabled={!email || !password || loading}
                className="w-full flex items-center justify-center gap-2 bg-[#0F172A] text-white px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#1e293b] transition-colors mt-1"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : 'Sign in'}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-[#94a3b8]">
              No account yet?{' '}
              <button
                onClick={() => { setShowSignIn(false); void navigate('/onboarding') }}
                className="text-[#2563EB] hover:underline"
              >
                Create one
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
