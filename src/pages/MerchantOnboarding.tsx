import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingBag, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { api } from '../lib/api'
import { setCurrentMerchantId } from '../lib/merchantStore'
import { toast } from 'sonner'

const CATEGORIES = [
  { id: 'groceries', label: 'Groceries', emoji: '🛒' },
  { id: 'food', label: 'Food & Drinks', emoji: '🍽️' },
  { id: 'transport', label: 'Transport', emoji: '🚌' },
  { id: 'clothing', label: 'Clothing', emoji: '👕' },
  { id: 'services', label: 'Services', emoji: '🔧' },
  { id: 'retail', label: 'Retail', emoji: '🏪' },
  { id: 'health', label: 'Health', emoji: '💊' },
  { id: 'other', label: 'Other', emoji: '📦' },
]

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'NGN', label: 'Nigerian Naira' },
  { code: 'GHS', label: 'Ghanaian Cedi' },
  { code: 'KES', label: 'Kenyan Shilling' },
  { code: 'ZAR', label: 'South African Rand' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'EUR', label: 'Euro' },
  { code: 'JPY', label: 'Japanese Yen' },
]

const STEPS = ['Business info', 'Category', 'Currency']

export default function MerchantOnboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!name.trim() || !category) return
    setLoading(true)
    try {
      const merchant = await api.createMerchant({ name: name.trim(), category, local_currency: currency })
      setCurrentMerchantId(merchant.id)
      void navigate('/dashboard')
    } catch (err) {
      toast.error('Could not create your account. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const canAdvance =
    (step === 0 && name.trim().length >= 2) ||
    (step === 1 && category !== '') ||
    step === 2

  return (
    <div className="min-h-dvh bg-[#FAFAF8] flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <div className="w-9 h-9 bg-[#0F172A] rounded-xl flex items-center justify-center">
          <ShoppingBag size={18} className="text-white" />
        </div>
        <span className="text-lg font-semibold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
          Retailer
        </span>
      </div>

      <div className="w-full max-w-md">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  i < step
                    ? 'bg-[#16A34A] text-white'
                    : i === step
                    ? 'bg-[#0F172A] text-white'
                    : 'bg-[rgba(15,23,42,0.08)] text-[#94a3b8]'
                }`}
              >
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-[#16A34A]' : 'bg-[rgba(15,23,42,0.1)]'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white/90 backdrop-blur-sm border border-[rgba(15,23,42,0.06)] rounded-2xl shadow-sm overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="p-8"
            >
              {step === 0 && (
                <div>
                  <h2 className="text-2xl font-bold text-[#0F172A] mb-1" style={{ fontFamily: 'Space Grotesk' }}>
                    Name your business
                  </h2>
                  <p className="text-sm text-[#64748b] mb-6">This appears on every payment receipt.</p>
                  <input
                    type="text"
                    placeholder="e.g. Mama Cee's Kitchen"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canAdvance && setStep(1)}
                    className="w-full px-4 py-3 rounded-xl border border-[rgba(15,23,42,0.12)] bg-[#FAFAF8] text-[#0F172A] text-base focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-all"
                    autoFocus
                  />
                </div>
              )}

              {step === 1 && (
                <div>
                  <h2 className="text-2xl font-bold text-[#0F172A] mb-1" style={{ fontFamily: 'Space Grotesk' }}>
                    Business type
                  </h2>
                  <p className="text-sm text-[#64748b] mb-6">Choose the category that best describes you.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCategory(c.id)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                          category === c.id
                            ? 'border-[#0F172A] bg-[#0F172A] text-white'
                            : 'border-[rgba(15,23,42,0.1)] bg-white text-[#0F172A] hover:border-[#0F172A]/40'
                        }`}
                      >
                        <span className="text-xl">{c.emoji}</span>
                        <span className="text-sm font-medium">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h2 className="text-2xl font-bold text-[#0F172A] mb-1" style={{ fontFamily: 'Space Grotesk' }}>
                    Local currency
                  </h2>
                  <p className="text-sm text-[#64748b] mb-6">
                    Prices will display in this currency alongside USDC.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {CURRENCIES.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => setCurrency(c.code)}
                        className={`flex flex-col px-4 py-3 rounded-xl border text-left transition-all ${
                          currency === c.code
                            ? 'border-[#0F172A] bg-[#0F172A] text-white'
                            : 'border-[rgba(15,23,42,0.1)] bg-white text-[#0F172A] hover:border-[#0F172A]/40'
                        }`}
                      >
                        <span className="text-sm font-semibold">{c.code}</span>
                        <span className={`text-xs ${currency === c.code ? 'text-white/70' : 'text-[#64748b]'}`}>
                          {c.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Actions */}
          <div className="px-8 pb-8 flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1 text-sm text-[#64748b] hover:text-[#0F172A] transition-colors min-h-[44px] px-3"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
            <button
              onClick={() => { if (step < 2) { setStep((s) => s + 1) } else { void handleSubmit() } }}
              disabled={!canAdvance || loading}
              className="ml-auto flex items-center gap-2 bg-[#0F172A] text-white px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#1e293b] transition-colors min-h-[44px]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Setting up your account...
                </span>
              ) : step < 2 ? (
                <>
                  Continue <ArrowRight size={14} />
                </>
              ) : (
                <>
                  Create my account <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#94a3b8]">
          A secure payment wallet will be created for your business on Arc Testnet.
        </p>
      </div>
    </div>
  )
}
