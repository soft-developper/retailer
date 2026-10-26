import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Download, ArrowLeft, RefreshCw, Copy, Check } from 'lucide-react'
import { api, type Merchant, type Product } from '../lib/api'
import { getCurrentMerchantId } from '../lib/merchantStore'
import { buildShareLink } from '../lib/share'
import Sidebar from '../components/ui/Sidebar'
import { toast } from 'sonner'
import { TokenUSDC } from '@web3icons/react'

export default function MerchantQR() {
  const navigate = useNavigate()
  const merchantId = getCurrentMerchantId()!

  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [fxRate, setFxRate] = useState(1)
  const [permanentUrl, setPermanentUrl] = useState('')
  const [dynamicUrl, setDynamicUrl] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const permanentRef = useRef<HTMLDivElement>(null)

  const load = useCallback((): void => {
    void (async () => {
      const m = await api.getMerchant(merchantId)
      setMerchant(m)
      const prods = await api.getProducts(merchantId)
      setProducts(prods)
      if (m.local_currency !== 'USD') {
        try {
          const fx = await api.getFxRate(m.local_currency)
          setFxRate(fx.usdRate)
        } catch {
          setFxRate(1)
        }
      }
      const url = await buildShareLink(`/checkout?merchant=${merchantId}`)
      setPermanentUrl(url)
    })()
  }, [merchantId])

  useEffect(() => { load() }, [load])

  async function generateDynamic() {
    if (!merchant) return
    setGenerating(true)
    try {
      let amountUsdc = 0
      let amountLocal: number | undefined
      let usedProduct = selectedProduct

      if (usedProduct) {
        amountLocal = usedProduct.local_price
        amountUsdc = amountLocal * fxRate
      } else if (amount) {
        amountUsdc = parseFloat(amount)
      }

      if (amountUsdc <= 0) {
        toast.error('Enter an amount or select a product')
        return
      }

      const session = await api.createSession({
        merchant_id: merchantId,
        amount_usdc: amountUsdc,
        amount_local: amountLocal,
        currency: merchant.local_currency,
        fx_rate: fxRate,
      })
      const url = await buildShareLink(
        `/checkout?merchant=${merchantId}&session=${session.id}&amount=${amountUsdc.toFixed(6)}`,
      )
      setDynamicUrl(url)
    } catch (err) {
      toast.error('Could not generate QR code')
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  function downloadQR() {
    if (!permanentRef.current) return
    const svg = permanentRef.current.querySelector('svg')
    if (!svg) return
    const serializer = new XMLSerializer()
    const source = serializer.serializeToString(svg)
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 440
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, 400, 440)
      ctx.drawImage(img, 40, 40, 320, 320)
      ctx.font = '600 18px Space Grotesk, sans-serif'
      ctx.fillStyle = '#0F172A'
      ctx.textAlign = 'center'
      ctx.fillText(merchant?.name ?? 'Retailer', 200, 405)
      ctx.font = '400 13px DM Sans, sans-serif'
      ctx.fillStyle = '#64748b'
      ctx.fillText('Scan to pay with USDC', 200, 428)
      const link = document.createElement('a')
      link.download = `retailer-qr-${merchant?.name ?? 'merchant'}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source)
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!merchant) return null

  return (
    <div className="min-h-dvh bg-[#FAFAF8] lg:flex">
      <Sidebar merchant={merchant} />

      <main className="flex-1 pt-16 lg:pt-0 overflow-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => { void navigate('/dashboard') }}
              className="p-2 rounded-xl hover:bg-[rgba(15,23,42,0.05)] text-[#64748b] transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-xl font-bold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
              QR Codes
            </h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Permanent QR */}
            <div className="bg-white/90 border border-[rgba(15,23,42,0.06)] rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-[rgba(15,23,42,0.06)]">
                <h2 className="text-sm font-semibold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
                  Permanent business QR
                </h2>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Print and display at your counter. Customers enter the amount.
                </p>
              </div>

              <div className="p-6 flex flex-col items-center">
                {permanentUrl ? (
                  <div ref={permanentRef} className="p-4 bg-white rounded-xl shadow-inner border border-[rgba(15,23,42,0.06)]">
                    <QRCodeSVG
                      value={permanentUrl}
                      size={220}
                      level="H"
                      includeMargin={false}
                      imageSettings={{
                        src: 'data:image/svg+xml;base64,...',
                        width: 0,
                        height: 0,
                        excavate: false,
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-[252px] h-[252px] bg-[rgba(15,23,42,0.04)] rounded-xl animate-pulse" />
                )}

                <p className="mt-4 text-sm font-semibold text-[#0F172A]">{merchant.name}</p>
                <p className="text-xs text-[#94a3b8] mt-0.5">Scan to pay with USDC</p>

                <div className="mt-5 flex gap-2 w-full">
                  <button
                    onClick={() => { downloadQR() }}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#0F172A] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#1e293b] transition-colors"
                  >
                    <Download size={14} />
                    Download PNG
                  </button>
                  <button
                    onClick={() => { void copyUrl(permanentUrl) }}
                    className="flex items-center justify-center gap-1.5 border border-[rgba(15,23,42,0.1)] px-3 py-2.5 rounded-xl text-sm text-[#334155] hover:border-[#0F172A]/30 transition-colors"
                    title="Copy checkout link"
                  >
                    {copied ? <Check size={14} className="text-[#16A34A]" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Dynamic QR */}
            <div className="bg-white/90 border border-[rgba(15,23,42,0.06)] rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-[rgba(15,23,42,0.06)]">
                <h2 className="text-sm font-semibold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
                  Dynamic checkout QR
                </h2>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Set a specific amount — customer sees the exact total with fees.
                </p>
              </div>

              <div className="p-5 space-y-4">
                {/* Product selector */}
                {products.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-[#334155] mb-2">Select product</p>
                    <div className="grid grid-cols-2 gap-2">
                      {products.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedProduct(selectedProduct?.id === p.id ? null : p)
                            setAmount('')
                          }}
                          className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${
                            selectedProduct?.id === p.id
                              ? 'border-[#0F172A] bg-[#0F172A] text-white'
                              : 'border-[rgba(15,23,42,0.1)] text-[#334155] hover:border-[#0F172A]/40'
                          }`}
                        >
                          <p className="font-medium truncate">{p.name}</p>
                          <p className={selectedProduct?.id === p.id ? 'text-white/60' : 'text-[#94a3b8]'}>
                            {p.local_price.toFixed(2)} {merchant.local_currency}
                          </p>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[#94a3b8] mt-2 text-center">or enter amount manually</p>
                  </div>
                )}

                {/* Manual amount */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <TokenUSDC size={16} variant="branded" />
                  </div>
                  <input
                    type="number"
                    placeholder="Amount in USDC"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setSelectedProduct(null) }}
                    min="0"
                    step="0.01"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[rgba(15,23,42,0.12)] bg-[#FAFAF8] text-[#0F172A] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] tabular-nums"
                  />
                </div>

                <button
                  onClick={() => { void generateDynamic() }}
                  disabled={(!amount && !selectedProduct) || generating}
                  className="w-full flex items-center justify-center gap-2 bg-[#0F172A] text-white px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-[#1e293b] transition-colors"
                >
                  {generating ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Generate QR
                </button>

                {dynamicUrl && (
                  <div className="flex flex-col items-center pt-2">
                    <div className="p-3 bg-white rounded-xl shadow-inner border border-[rgba(15,23,42,0.06)]">
                      <QRCodeSVG value={dynamicUrl} size={180} level="H" />
                    </div>
                    <p className="text-xs text-[#94a3b8] mt-2 text-center">
                      Valid for 15 minutes
                    </p>
                    <button
                      onClick={() => { void copyUrl(dynamicUrl) }}
                      className="mt-2 flex items-center gap-1.5 text-xs text-[#2563EB] hover:text-[#1d4ed8] transition-colors"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      Copy link
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
