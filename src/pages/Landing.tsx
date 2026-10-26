import { useNavigate } from 'react-router-dom'
import { getCurrentMerchantId } from '../lib/merchantStore'
import { ShoppingBag, QrCode, BarChart3, ArrowRight } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'

export default function Landing() {
  const navigate = useNavigate()
  const merchantId = getCurrentMerchantId()

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
        <button
          onClick={() => { void navigate(merchantId ? '/dashboard' : '/onboarding') }}
          className="text-sm font-medium text-[#0F172A] hover:text-[#2563EB] transition-colors"
        >
          {merchantId ? 'Dashboard' : 'Sign up'}
        </button>
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
    </div>
  )
}
