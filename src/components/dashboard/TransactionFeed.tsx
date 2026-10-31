import { ExternalLink } from 'lucide-react'
import StatusBadge from '../ui/StatusBadge'
import SkeletonCard from '../ui/SkeletonCard'
import type { Transaction } from '../../lib/api'

const ARC_EXPLORER = 'https://explorer.arc.io'

interface Props {
  transactions: Transaction[]
  loading: boolean
  currency: string
  fxRate: number
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortAddr(addr: string | null | undefined) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function TransactionFeed({ transactions, loading, currency, fxRate }: Props) {
  if (loading) return <SkeletonCard lines={5} />

  return (
    <div className="bg-white/80 backdrop-blur-sm border border-[rgba(15,23,42,0.06)] rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[rgba(15,23,42,0.06)]">
        <h3 className="text-sm font-semibold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
          Recent payments
        </h3>
      </div>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-6">
          <div className="w-12 h-12 bg-[rgba(15,23,42,0.04)] rounded-full flex items-center justify-center mb-4">
            <ExternalLink size={20} className="text-[#94a3b8]" />
          </div>
          <p className="text-sm font-medium text-[#334155]">No payments yet</p>
          <p className="text-xs text-[#94a3b8] mt-1 max-w-xs">
            Share your QR code to start accepting payments. They will appear here instantly after confirmation.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[rgba(15,23,42,0.04)]">
          {transactions.map((tx) => {
            const localAmt =
              currency !== 'USD' && fxRate
                ? new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                    tx.amount_usdc / fxRate,
                  )
                : null

            return (
              <div key={tx.id} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-[#0F172A] tabular-nums">
                      {tx.amount_usdc.toFixed(2)} USDC
                    </span>
                    {localAmt && (
                      <span className="text-xs text-[#94a3b8] tabular-nums">≈ {localAmt} {currency}</span>
                    )}
                  </div>
                  <p className="text-xs text-[#64748b]">
                    From {shortAddr(tx.from_address)} · {formatDate(tx.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusBadge status={tx.status} />
                  {tx.tx_hash && (
                    <a
                      href={`${ARC_EXPLORER}/tx/${tx.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-[#94a3b8] hover:text-[#2563EB] transition-colors"
                      title="View on explorer"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
