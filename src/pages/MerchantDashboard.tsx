import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode, RefreshCw } from 'lucide-react'
import { api, type Merchant, type Transaction, type Product } from '../lib/api'
import { getCurrentMerchantId } from '../lib/merchantStore'
import Sidebar from '../components/ui/Sidebar'
import RevenueCard from '../components/dashboard/RevenueCard'
import QuickStats from '../components/dashboard/QuickStats'
import TransactionFeed from '../components/dashboard/TransactionFeed'
import ProductList from '../components/dashboard/ProductList'
import SkeletonCard from '../components/ui/SkeletonCard'
import OnrampModal from '../components/dashboard/OnrampModal'

export default function MerchantDashboard() {
  const navigate = useNavigate()
  const merchantId = getCurrentMerchantId()!

  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [fxRate, setFxRate] = useState(1)
  const [loading, setLoading] = useState(true)
  const [txLoading, setTxLoading] = useState(true)
  const [showOnramp, setShowOnramp] = useState(false)

  const loadMerchant = useCallback((): void => {
    void (async () => {
      try {
        const m = await api.getMerchant(merchantId)
        setMerchant(m)
        if (m.local_currency !== 'USD') {
          if (m.fx_rate_override) {
            setFxRate(1 / m.fx_rate_override)
          } else {
            try {
              const fx = await api.getFxRate(m.local_currency)
              setFxRate(fx.usdRate)
            } catch {
              setFxRate(1)
            }
          }
        }
      } catch {
        void navigate('/')
      } finally {
        setLoading(false)
      }
    })()
  }, [merchantId, navigate])

  const loadTransactions = useCallback((): void => {
    void (async () => {
      setTxLoading(true)
      try {
        const txs = await api.getTransactions(merchantId)
        setTransactions(txs)
      } finally {
        setTxLoading(false)
      }
    })()
  }, [merchantId])

  const loadProducts = useCallback((): void => {
    void (async () => {
      const prods = await api.getProducts(merchantId)
      setProducts(prods)
    })()
  }, [merchantId])

  useEffect(() => {
    loadMerchant()
    loadTransactions()
    loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId])

  // Poll transactions every 15s
  useEffect(() => {
    const id = setInterval(loadTransactions, 15_000)
    return () => clearInterval(id)
  }, [loadTransactions])

  if (loading || !merchant) {
    return (
      <div className="min-h-dvh bg-[#FAFAF8] lg:flex">
        <div className="hidden lg:block w-56 bg-white border-r border-[rgba(15,23,42,0.06)]" />
        <main className="flex-1 p-6 space-y-4">
          <SkeletonCard lines={2} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} lines={2} />)}
          </div>
          <SkeletonCard lines={5} />
        </main>
      </div>
    )
  }

  const currency = merchant.local_currency

  return (
    <div className="min-h-dvh bg-[#FAFAF8] lg:flex">
      <Sidebar merchant={merchant} />

      <main className="flex-1 pt-16 lg:pt-0 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
                Overview
              </h1>
              <p className="text-sm text-[#64748b]">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { loadTransactions(); loadProducts() ; }}
                className="p-2 rounded-xl hover:bg-[rgba(15,23,42,0.05)] transition-colors text-[#64748b]"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
              <button
                onClick={() => { void navigate('/dashboard/qr') }}
                className="flex items-center gap-2 bg-[#0F172A] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#1e293b] transition-colors"
              >
                <QrCode size={15} />
                <span className="hidden sm:inline">QR Codes</span>
              </button>
            </div>
          </div>

          {/* Balance card */}
          <RevenueCard
            merchant={merchant}
            fxRate={fxRate}
            currency={currency}
            onTopUp={() => setShowOnramp(true)}
          />

          {/* Stats */}
          <QuickStats transactions={transactions} currency={currency} fxRate={fxRate} />

          {/* Grid: transactions + products */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <TransactionFeed
              transactions={transactions}
              loading={txLoading}
              currency={currency}
              fxRate={fxRate}
            />
            <ProductList
              merchantId={merchantId}
              products={products}
              currency={currency}
              fxRate={fxRate}
              onRefresh={loadProducts}
            />
          </div>
        </div>
      </main>

      {showOnramp && merchant.arc_wallet_address && (
        <OnrampModal
          merchantId={merchant.id}
          walletAddress={merchant.arc_wallet_address}
          onClose={() => setShowOnramp(false)}
        />
      )}
    </div>
  )
}
