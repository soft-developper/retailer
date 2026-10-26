import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, ExternalLink, ArrowLeft } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { api, type Merchant } from '../lib/api'
import { TokenUSDC } from '@web3icons/react'

const ARC_TESTNET_CHAIN_ID = 5042002

export default function PaymentConfirmed() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const txHash = params.get('tx')
  const merchantId = params.get('merchant')
  const already = params.get('already')

  const [merchant, setMerchant] = useState<Merchant | null>(null)

  useEffect(() => {
    if (merchantId) {
      void api.getMerchant(merchantId).then(setMerchant).catch(() => {})
    }
  }, [merchantId])

  const explorerUrl = txHash ? buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, txHash) : null

  return (
    <div className="min-h-dvh bg-[#FAFAF8] flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="w-full max-w-sm"
      >
        {/* Success card */}
        <div className="bg-white/90 border border-[rgba(15,23,42,0.06)] rounded-3xl p-8 shadow-lg text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
            className="w-20 h-20 bg-[#DCFCE7] rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle2 size={40} className="text-[#16A34A]" />
          </motion.div>

          <h1
            className="text-3xl font-bold text-[#0F172A] mb-2"
            style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.02em' }}
          >
            {already ? 'Already paid' : 'Payment confirmed'}
          </h1>

          {merchant && (
            <p className="text-[#64748b] text-sm mb-1">
              {already ? 'This payment was already completed.' : `Your payment to `}
              {!already && <span className="font-semibold text-[#0F172A]">{merchant.name}</span>}
              {!already && ' has settled on-chain.'}
            </p>
          )}

          <div className="mt-6 flex items-center justify-center gap-2 bg-[#F0FDF4] rounded-xl px-4 py-3">
            <TokenUSDC size={18} variant="branded" />
            <span className="text-sm font-medium text-[#15803D]">Payment complete on Arc Testnet</span>
          </div>

          {txHash && (
            <div className="mt-4">
              <p className="text-xs text-[#94a3b8] mb-2 font-mono break-all">
                {txHash.slice(0, 18)}…{txHash.slice(-10)}
              </p>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors"
                >
                  View on Arc Explorer <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          <div className="mt-8 space-y-3">
            <button
              onClick={() => { void navigate(`/checkout?merchant=${merchantId ?? ''}`) }}
              className="w-full py-3 rounded-xl bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1e293b] transition-colors"
            >
              Make another payment
            </button>
            <button
              onClick={() => { void navigate('/') }}
              className="w-full py-3 rounded-xl text-sm font-medium text-[#64748b] hover:text-[#0F172A] flex items-center justify-center gap-1.5 transition-colors"
            >
              <ArrowLeft size={14} />
              Back to home
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-[#94a3b8] mt-6">
          This receipt is stored permanently on the Arc blockchain.
        </p>
      </motion.div>
    </div>
  )
}
