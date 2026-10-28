import { useState } from 'react'
import { Plus, Trash2, Package, Pencil, Check, X } from 'lucide-react'
import { api, type Product } from '../../lib/api'
import { toast } from 'sonner'

interface Props {
  merchantId: string
  products: Product[]
  currency: string
  fxRate: number
  onRefresh: () => void
}

interface EditState {
  name: string
  price: string
  sku: string
}

export default function ProductList({ merchantId, products, currency, fxRate, onRefresh }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [sku, setSku] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ name: '', price: '', sku: '' })
  const [editSaving, setEditSaving] = useState(false)

  function startEdit(p: Product) {
    setEditingId(p.id)
    setEditState({ name: p.name, price: p.local_price.toString(), sku: p.sku ?? '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState({ name: '', price: '', sku: '' })
  }

  async function saveEdit(id: string) {
    const newPrice = parseFloat(editState.price)
    if (!editState.name.trim() || isNaN(newPrice) || newPrice <= 0) {
      toast.error('Name and a valid price are required')
      return
    }
    setEditSaving(true)
    try {
      await api.updateProduct(id, {
        name: editState.name.trim(),
        local_price: newPrice,
        sku: editState.sku.trim() || undefined,
      })
      cancelEdit()
      onRefresh()
      toast.success('Product updated')
    } catch {
      toast.error('Could not update product')
    } finally {
      setEditSaving(false)
    }
  }

  async function addProduct() {
    if (!name.trim() || !price) return
    setSaving(true)
    try {
      await api.createProduct(merchantId, {
        name: name.trim(),
        local_price: parseFloat(price),
        sku: sku.trim() || undefined,
      })
      setName('')
      setPrice('')
      setSku('')
      setAdding(false)
      onRefresh()
      toast.success('Product added')
    } catch (err) {
      toast.error('Could not add product')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function deleteProduct(id: string) {
    try {
      await api.deleteProduct(id)
      onRefresh()
      toast.success('Product removed')
    } catch {
      toast.error('Could not remove product')
    }
  }

  const usdcPrice = (localPrice: number) =>
    fxRate ? (localPrice * fxRate).toFixed(2) : '—'

  return (
    <div className="bg-white/80 backdrop-blur-sm border border-[rgba(15,23,42,0.06)] rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[rgba(15,23,42,0.06)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#0F172A]" style={{ fontFamily: 'Space Grotesk' }}>
          Products
        </h3>
        <button
          onClick={() => { setAdding(true); cancelEdit() }}
          className="flex items-center gap-1.5 text-xs font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors min-h-[32px] px-2"
        >
          <Plus size={14} />
          Add product
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-5 py-4 border-b border-[rgba(15,23,42,0.06)] bg-[#F8FAFC]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <input
              placeholder="Product name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-[rgba(15,23,42,0.12)] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
              autoFocus
            />
            <input
              placeholder={`Price in ${currency}`}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              className="px-3 py-2 text-sm rounded-lg border border-[rgba(15,23,42,0.12)] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
            />
            <input
              placeholder="SKU (optional)"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-[rgba(15,23,42,0.12)] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { void addProduct() }}
              disabled={!name.trim() || !price || saving}
              className="px-4 py-2 bg-[#0F172A] text-white text-xs font-semibold rounded-lg disabled:opacity-40 hover:bg-[#1e293b] transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="px-4 py-2 text-xs font-medium text-[#64748b] hover:text-[#0F172A] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {products.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <Package size={32} className="text-[#cbd5e1] mb-3" />
          <p className="text-sm font-medium text-[#334155]">No products yet</p>
          <p className="text-xs text-[#94a3b8] mt-1">
            Add products to quickly generate checkout QR codes.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[rgba(15,23,42,0.04)]">
          {products.map((p) =>
            editingId === p.id ? (
              /* ── Inline edit row ── */
              <div key={p.id} className="px-5 py-3 bg-[#F8FAFC]">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                  <input
                    value={editState.name}
                    onChange={(e) => setEditState(s => ({ ...s, name: e.target.value }))}
                    placeholder="Product name"
                    autoFocus
                    className="px-3 py-1.5 text-sm rounded-lg border border-[#2563EB]/40 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                  />
                  <input
                    value={editState.price}
                    onChange={(e) => setEditState(s => ({ ...s, price: e.target.value }))}
                    placeholder={`Price in ${currency}`}
                    type="number"
                    min="0"
                    step="0.01"
                    className="px-3 py-1.5 text-sm rounded-lg border border-[#2563EB]/40 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                  />
                  <input
                    value={editState.sku}
                    onChange={(e) => setEditState(s => ({ ...s, sku: e.target.value }))}
                    placeholder="SKU (optional)"
                    className="px-3 py-1.5 text-sm rounded-lg border border-[rgba(15,23,42,0.12)] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { void saveEdit(p.id) }}
                    disabled={editSaving}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#0F172A] text-white text-xs font-semibold rounded-lg disabled:opacity-40 hover:bg-[#1e293b] transition-colors"
                  >
                    <Check size={12} />
                    {editSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#64748b] hover:text-[#0F172A] transition-colors"
                  >
                    <X size={12} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── Normal row ── */
              <div key={p.id} className="px-5 py-3.5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0F172A] truncate">{p.name}</p>
                  {p.sku && <p className="text-xs text-[#94a3b8] font-mono">{p.sku}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-[#0F172A] tabular-nums">
                    {p.local_price.toFixed(2)} {currency}
                  </p>
                  <p className="text-xs text-[#94a3b8] tabular-nums">
                    {usdcPrice(p.local_price)} USDC
                  </p>
                </div>
                <div className="text-right flex-shrink-0 text-xs text-[#94a3b8] hidden sm:block w-16">
                  {p.units_sold} sold
                </div>
                <button
                  onClick={() => startEdit(p)}
                  className="p-1.5 text-[#cbd5e1] hover:text-[#2563EB] transition-colors flex-shrink-0"
                  title="Edit product"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => { void deleteProduct(p.id) }}
                  className="p-1.5 text-[#cbd5e1] hover:text-[#DC2626] transition-colors flex-shrink-0"
                  title="Delete product"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
