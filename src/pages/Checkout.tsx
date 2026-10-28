import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { parseUnits, keccak256, toBytes } from 'viem'
import { arcTestnet } from 'viem/chains'
import { ShoppingBag, ShieldCheck, AlertCircle } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { api, type Merchant, type CheckoutSession } from '../lib/api'
import retailerPaymentsArtifact from '../../contracts/out/RetailerPayments.sol/RetailerPayments.json'

const ARC_TESTNET_CHAIN_ID = arcTestnet.id
const PLATFORM_FEE_USDC = 0.01
const ESTIMATED_GAS_USDC = 0.001

const RETAILER_PAYMENTS_ADDRESS = (import.meta.env.VITE_RETAILER_PAYMENTS_ADDRESS ?? '') as `0x${string}`
const RETAILER_PAYMENTS_ABI = retailerPaymentsArtifact.abi

// Encode sessionId string → bytes32
function toBytes32(s: string): `0x${string}` {
  return keccak256(toBytes(s))
}

// USDC decimals on Arc
const USDC_DECIMALS = 6

export default function Checkout() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const merchantId = params.get('merchant')
  const sessionId = params.get('session')
  const amountParam = params.get('amount')

  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [session, setSession] = useState<CheckoutSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [confirming, setConfirming] = useState(false)

  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  const isWrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID

  // Load merchant and session
  useEffect(() => {
    if (!merchantId) { setError('Invalid payment link'); setLoading(false); return }
    void (async () => {
      try {
        const m = await api.getMerchant(merchantId)
        setMerchant(m)
        if (sessionId) {
          const s = await api.getSession(sessionId)
          if (s.status === 'CONFIRMED') {
            void navigate('/pay-confirmed?already=true')
            return
          }
          if (s.status === 'EXPIRED') {
            setError('This payment link has expired. Ask the merchant for a new one.')
            return
          }
          setSession(s)
        }
      } catch {
        setError('Could not load payment details. The link may be invalid.')
      } finally {
        setLoading(false)
      }
    })()
  }, [merchantId, sessionId, navigate])

  // After on-chain receipt confirmed, record in DB
  useEffect(() => {
    if (!isSuccess || !receipt || confirming) return
    setConfirming(true)
    const sid = session?.id ?? sessionId
    void (async () => {
      try {
        if (sid) {
          await api.confirmSession(sid, {
            tx_hash: receipt.transactionHash,
            from_address: address ?? '',
            network_fee_usdc: ESTIMATED_GAS_USDC,
            platform_fee_usdc: PLATFORM_FEE_USDC,
          })
        }
      } catch (err) {
        console.error('record confirmation error:', err)
      } finally {
        // Navigate regardless — payment succeeded on-chain
        void navigate(`/pay-confirmed?tx=${receipt.transactionHash}&merchant=${merchantId}`)
      }
    })()
  }, [isSuccess, receipt, session, sessionId, address, merchantId, navigate, confirming])

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#FAFAF8] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[rgba(15,23,42,0.15)] border-t-[#0F172A] rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-[#FAFAF8] flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white/90 border border-[rgba(15,23,42,0.06)] rounded-2xl p-8 text-center shadow-sm">
          <AlertCircle size={40} className="text-[#DC2626] mx-auto mb-4" />
          <h2 className="text-lg font-bold text-[#0F172A] mb-2" style={{ fontFamily: 'Space Grotesk' }}>
            Payment unavailable
          </h2>
          <p className="text-sm text-[#64748b]">{error}</p>
        </div>
      </div>
    )
  }

  if (!merchant) return null

  const amountUsdc = session
    ? session.amount_usdc
    : amountParam
    ? parseFloat(amountParam)
    : parseFloat(manualAmount || '0')

  const totalUsdc = amountUsdc + ESTIMATED_GAS_USDC + PLATFORM_FEE_USDC

  function handlePay() {
    if (!merchant || amountUsdc <= 0) return
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return }

    const sid = session?.id ?? sessionId ?? 'open'
    const raw = parseUnits(amountUsdc.toFixed(6), USDC_DECIMALS)

    writeContract({
      address: RETAILER_PAYMENTS_ADDRESS,
      abi: RETAILER_PAYMENTS_ABI,
      functionName: 'pay',
      args: [merchant.arc_wallet_address as `0x${string}`, toBytes32(sid), raw],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const catIcons: Record<string, string> = {
    groceries: '🛒', food: '🍽️', transport: '🚌',
    clothing: '👕', services: '🔧', retail: '🏪', health: '💊', other: '📦',
  }

  return (
    <div className="min-h-dvh bg-[#FAFAF8] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        {/* Merchant card */}
        <div className="bg-white/90 border border-[rgba(15,23,42,0.06)] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#F1F5FE] rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
              {catIcons[merchant.category] ?? <ShoppingBag size={20} className="text-[#2563EB]" />}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[#0F172A] truncate" style={{ fontFamily: 'Space Grotesk' }}>
                {merchant.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <ShieldCheck size={12} className="text-[#16A34A]" />
                <span className="text-xs text-[#16A34A] font-medium">Verified merchant</span>
              </div>
            </div>
          </div>
        </div>

        {/* Amount */}
        <div className="bg-white/90 border border-[rgba(15,23,42,0.06)] rounded-2xl p-5 shadow-sm">
          {session ? (
            <div className="text-center py-2">
              <p className="text-xs font-medium text-[#64748b] uppercase mb-2" style={{ letterSpacing: '0.06em' }}>
                Amount to pay
              </p>
              <p
                className="text-4xl font-bold text-[#0F172A] tabular-nums"
                style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.03em' }}
              >
                {session.amount_usdc.toFixed(2)}
                <span className="text-xl text-[#94a3b8] ml-2 font-medium">USDC</span>
              </p>
              {session.amount_local && session.currency && session.currency !== 'USD' && (
                <p className="text-sm text-[#94a3b8] mt-1 tabular-nums">
                  ≈ {session.amount_local.toFixed(2)} {session.currency}
                </p>
              )}
            </div>
          ) : amountParam ? (
            <div className="text-center py-2">
              <p className="text-xs font-medium text-[#64748b] uppercase mb-2" style={{ letterSpacing: '0.06em' }}>
                Amount to pay
              </p>
              <p
                className="text-4xl font-bold text-[#0F172A] tabular-nums"
                style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.03em' }}
              >
                {parseFloat(amountParam).toFixed(2)}
                <span className="text-xl text-[#94a3b8] ml-2 font-medium">USDC</span>
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-medium text-[#64748b] mb-2">Enter amount</p>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <TokenUSDC size={18} variant="branded" />
                </div>
                <input
                  type="number"
                  placeholder="0.00"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[rgba(15,23,42,0.12)] bg-[#FAFAF8] text-[#0F172A] text-xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Fee breakdown */}
        {amountUsdc > 0 && (
          <div className="bg-white/90 border border-[rgba(15,23,42,0.06)] rounded-2xl p-5 shadow-sm space-y-2.5">
            <p className="text-xs font-semibold text-[#334155] uppercase" style={{ letterSpacing: '0.06em' }}>
              Breakdown
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-[#64748b]">To merchant</span>
              <span className="font-medium text-[#0F172A] tabular-nums">{amountUsdc.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#64748b]">Network fee (Arc gas)</span>
              <span className="font-medium text-[#0F172A] tabular-nums">~{ESTIMATED_GAS_USDC.toFixed(3)} USDC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#64748b]">Platform fee</span>
              <span className="font-medium text-[#0F172A] tabular-nums">{PLATFORM_FEE_USDC.toFixed(2)} USDC</span>
            </div>
            <div className="border-t border-[rgba(15,23,42,0.06)] pt-2.5 flex justify-between">
              <span className="text-sm font-semibold text-[#0F172A]">Total you pay</span>
              <span className="text-sm font-bold text-[#0F172A] tabular-nums">{totalUsdc.toFixed(3)} USDC</span>
            </div>
          </div>
        )}

        {/* Pay button */}
        <div className="space-y-3">
          {!isConnected ? (
            <div className="flex justify-center">
              <ConnectKitButton label="Connect wallet to pay" />
            </div>
          ) : isWrongChain ? (
            <button
              onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })}
              className="w-full py-4 rounded-xl bg-[#FEF9C3] text-[#854D0E] font-semibold text-sm border border-[#FDE047]/50"
            >
              Switch to Arc Testnet to continue
            </button>
          ) : isPending ? (
            <div className="w-full py-4 rounded-xl bg-[#0F172A] text-white font-semibold text-sm flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Confirm in your wallet…
            </div>
          ) : isConfirming || confirming ? (
            <div className="w-full py-4 rounded-xl bg-[#EFF6FF] text-[#1d4ed8] font-semibold text-sm flex items-center justify-center gap-2 border border-[#BFDBFE]">
              <span className="w-4 h-4 border-2 border-[#93c5fd] border-t-[#2563EB] rounded-full animate-spin" />
              Verifying on Arc…
            </div>
          ) : (
            <button
              onClick={handlePay}
              disabled={amountUsdc <= 0}
              className="w-full py-4 rounded-xl bg-[#0F172A] text-white font-semibold text-sm disabled:opacity-40 hover:bg-[#1e293b] transition-colors"
            >
              Pay {amountUsdc > 0 ? `${totalUsdc.toFixed(3)} USDC` : ''}
            </button>
          )}

          {writeError && (
            <p className="text-xs text-[#DC2626] text-center px-2">
              {writeError.message.includes('User rejected')
                ? 'Payment cancelled.'
                : 'Transaction failed. Please try again.'}
            </p>
          )}
        </div>

        <p className="text-center text-xs text-[#94a3b8]">
          Payments are settled instantly on Arc Testnet
        </p>
      </div>
    </div>
  )
}
