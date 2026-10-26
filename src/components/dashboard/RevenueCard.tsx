import { useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { getUsdc } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { TokenUSDC } from '@web3icons/react'
import { ArrowDownToLine } from 'lucide-react'
import type { Merchant } from '../../lib/api'

const ARC_TESTNET_CHAIN_ID = 5042002

interface Props {
  merchant: Merchant
  fxRate: number
  currency: string
  onTopUp?: () => void
}

export default function RevenueCard({ merchant, fxRate, currency, onTopUp }: Props) {
  const usdcFact = getUsdc(ARC_TESTNET_CHAIN_ID)

  const { data: rawBalance, isLoading } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [merchant.arc_wallet_address as `0x${string}`],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!usdcFact && !!merchant.arc_wallet_address, refetchInterval: 8000 },
  })

  const decimals = usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)
  const usdcAmount = rawBalance != null ? Amount.fromRaw(rawBalance, decimals) : null
  const usdcFormatted = usdcAmount ? usdcAmount.toFixed(2) : '—'
  const localFormatted =
    usdcAmount && fxRate
      ? new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
          parseFloat(usdcAmount.toFixed(6)) / fxRate,
        )
      : '—'

  return (
    <div className="bg-[#0F172A] text-white rounded-2xl p-6 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-white/60 uppercase tracking-wider" style={{ letterSpacing: '0.06em' }}>
          Wallet Balance
        </p>
        <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
          <TokenUSDC size={14} variant="mono" />
          <span className="text-xs font-medium text-white/80">USDC</span>
        </div>
      </div>

      {isLoading ? (
        <div className="h-10 w-36 bg-white/10 rounded-lg animate-pulse" />
      ) : (
        <p
          className="text-4xl font-bold tabular-nums"
          style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.03em' }}
        >
          {usdcFormatted}
          <span className="text-xl text-white/50 ml-2 font-medium">USDC</span>
        </p>
      )}

      {currency !== 'USD' && (
        <p className="mt-2 text-sm text-white/50 tabular-nums">
          {isLoading ? '…' : `≈ ${localFormatted} ${currency}`}
        </p>
      )}

      <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
        <p className="text-xs text-white/40 font-mono break-all min-w-0">
          {merchant.arc_wallet_address
            ? `${merchant.arc_wallet_address.slice(0, 10)}…${merchant.arc_wallet_address.slice(-8)}`
            : 'Wallet address unavailable'}
        </p>
        {onTopUp && (
          <button
            onClick={onTopUp}
            className="flex items-center gap-1.5 flex-shrink-0 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowDownToLine size={13} />
            Top up
          </button>
        )}
      </div>
    </div>
  )
}
