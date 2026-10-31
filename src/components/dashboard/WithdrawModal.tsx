import { useState, useEffect } from 'react'
import { X, ArrowUpRight, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { api } from '../../lib/api'
import { toast } from 'sonner'

interface Props {
  walletAddress: string
  onClose: () => void
  onSuccess: () => void
}

type Step = 'form' | 'confirming' | 'success' | 'error'

export default function WithdrawModal({ walletAddress, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('form')
  const [balance, setBalance] = useState<string | null>(null)
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [result, setResult] = useState<{ txHash?: string; explorerUrl?: string; feeEstimate?: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    api.getWalletBalance()
      .then(r => setBalance(r.balance))
      .catch(() => setBalance(null))
  }, [])

  const available = balance != null ? parseFloat(balance) : null
  const amountNum = parseFloat(amount || '0')
  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(destination)
  const isValidAmount = amountNum >= 0.01 && (available == null || amountNum <= available)
  const canSubmit = isValidAddress && isValidAmount && step === 'form'

  function setMax() {
    if (available != null && available > 0) {
      // Leave a small buffer for gas (USDC is gas on Arc, so subtract estimated fee)
      const max = Math.max(0, available - 0.001).toFixed(6)
      setAmount(max)
    }
  }

  async function handleWithdraw() {
    if (!canSubmit) return
    setStep('confirming')
    try {
      const res = await api.withdraw({ destination_address: destination, amount_usdc: amountNum })
      setResult({ txHash: res.txHash, explorerUrl: res.explorerUrl, feeEstimate: res.feeEstimate })
      setStep('success')
      toast.success('Withdrawal complete')
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Withdrawal failed'
      // Extract server error message
      const match = msg.match(/→ \d+: (.+)$/)
      let clean: string = msg
      if (match) {
        try { const parsed = JSON.parse(match[1]) as { error?: string }; clean = parsed.error ?? match[1] } catch { clean = match[1] }
      }
      setErrorMsg(clean)
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-2">
            <ArrowUpRight size={18} className="text-[#0F172A]" />
            <h2 className="text-base font-bold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
              Withdraw USDC
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgba(15,23,42,0.05)] text-[#64748b] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Success state */}
          {step === 'success' && result && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} className="text-[#16A34A]" />
              </div>
              <div>
                <p className="text-base font-bold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
                  Withdrawal complete
                </p>
                <p className="text-sm text-[#64748b] mt-1">
                  {amountNum.toFixed(2)} USDC sent successfully
                </p>
              </div>
              {result.feeEstimate && (
                <p className="text-xs text-[#94a3b8]">Network fee: ~{parseFloat(result.feeEstimate).toFixed(4)} USDC</p>
              )}
              {result.txHash && (
                <p className="text-xs font-mono text-[#64748b] break-all px-2">
                  {result.txHash.slice(0, 20)}…{result.txHash.slice(-10)}
                </p>
              )}
              {result.explorerUrl && (
                <a
                  href={result.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-[#2563EB] hover:text-[#1d4ed8] font-medium"
                >
                  View on Arc Explorer
                  <ExternalLink size={13} />
                </a>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-[#0F172A] text-white font-semibold text-sm hover:bg-[#1e293b] transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Error state */}
          {step === 'error' && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 bg-[#FEF2F2] rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={28} className="text-[#DC2626]" />
              </div>
              <div>
                <p className="text-base font-bold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
                  Withdrawal failed
                </p>
                <p className="text-sm text-[#DC2626] mt-1">{errorMsg}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('form')}
                  className="flex-1 py-3 rounded-xl bg-[#0F172A] text-white font-semibold text-sm hover:bg-[#1e293b] transition-colors"
                >
                  Try again
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-[rgba(15,23,42,0.1)] text-[#334155] font-semibold text-sm hover:border-[#0F172A]/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Confirming state */}
          {step === 'confirming' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 mx-auto border-2 border-[rgba(15,23,42,0.1)] border-t-[#0F172A] rounded-full animate-spin" />
              <p className="text-sm font-medium text-[#0F172A]">Processing withdrawal…</p>
              <p className="text-xs text-[#94a3b8]">Signing and broadcasting on Arc. This usually takes a few seconds.</p>
            </div>
          )}

          {/* Form state */}
          {step === 'form' && (
            <>
              {/* Balance */}
              <div className="bg-[#F8FAFC] rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TokenUSDC size={18} variant="branded" />
                  <span className="text-sm font-medium text-[#334155]">Available balance</span>
                </div>
                <span className="text-sm font-bold text-[#0F172A] tabular-nums">
                  {balance == null ? '…' : `${parseFloat(balance).toFixed(2)} USDC`}
                </span>
              </div>

              {/* From wallet */}
              <div>
                <p className="text-xs font-medium text-[#64748b] mb-1.5">From wallet</p>
                <p className="text-xs font-mono text-[#94a3b8] bg-[#F8FAFC] rounded-lg px-3 py-2.5 break-all">
                  {walletAddress}
                </p>
              </div>

              {/* Destination */}
              <div>
                <p className="text-xs font-medium text-[#334155] mb-1.5">Destination address</p>
                <input
                  type="text"
                  placeholder="0x…"
                  value={destination}
                  onChange={e => setDestination(e.target.value.trim())}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-colors ${
                    destination && !isValidAddress
                      ? 'border-[#FCA5A5] bg-[#FEF2F2]'
                      : 'border-[rgba(15,23,42,0.12)] bg-[#FAFAF8]'
                  }`}
                />
                {destination && !isValidAddress && (
                  <p className="text-xs text-[#DC2626] mt-1">Enter a valid Ethereum address (0x…)</p>
                )}
              </div>

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-[#334155]">Amount (USDC)</p>
                  <button
                    onClick={setMax}
                    className="text-xs text-[#2563EB] hover:text-[#1d4ed8] font-medium"
                  >
                    Max
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <TokenUSDC size={16} variant="branded" />
                  </div>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    min="0.01"
                    step="0.01"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[rgba(15,23,42,0.12)] bg-[#FAFAF8] text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                  />
                </div>
                {amount && !isValidAmount && (
                  <p className="text-xs text-[#DC2626] mt-1">
                    {amountNum < 0.01 ? 'Minimum withdrawal is 0.01 USDC' : 'Amount exceeds available balance'}
                  </p>
                )}
                <p className="text-xs text-[#94a3b8] mt-1.5">
                  A small network fee (~0.001 USDC) will be deducted from your balance.
                </p>
              </div>

              <button
                onClick={() => { void handleWithdraw() }}
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-xl bg-[#0F172A] text-white font-semibold text-sm disabled:opacity-40 hover:bg-[#1e293b] transition-colors flex items-center justify-center gap-2"
              >
                <ArrowUpRight size={16} />
                Withdraw {amountNum > 0 ? `${amountNum.toFixed(2)} USDC` : ''}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
