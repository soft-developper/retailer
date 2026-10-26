import type { Transaction } from '../../lib/api'

interface Props {
  transactions: Transaction[]
  currency: string
  fxRate: number
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function QuickStats({ transactions, currency, fxRate }: Props) {
  const today = todayISO()
  const todayTxs = transactions.filter(
    (t) => t.status === 'CONFIRMED' && t.created_at.slice(0, 10) === today,
  )

  const totalToday = todayTxs.reduce((s, t) => s + t.amount_usdc, 0)
  const avg = todayTxs.length ? totalToday / todayTxs.length : 0

  const allConfirmed = transactions.filter((t) => t.status === 'CONFIRMED')
  const allTotal = allConfirmed.reduce((s, t) => s + t.amount_usdc, 0)

  const fmt = (n: number) =>
    new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  const localFmt = (usdc: number) =>
    currency === 'USD' ? null : `≈ ${fmt(usdc / fxRate)} ${currency}`

  const stats = [
    { label: "Today's sales", value: `${fmt(totalToday)} USDC`, sub: localFmt(totalToday), accent: false },
    { label: "Today's count", value: todayTxs.length.toString(), sub: 'payments confirmed', accent: false },
    { label: 'Avg. sale', value: `${fmt(avg)} USDC`, sub: localFmt(avg), accent: false },
    { label: 'All-time volume', value: `${fmt(allTotal)} USDC`, sub: `${allConfirmed.length} payments`, accent: true },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-white/80 backdrop-blur-sm border border-[rgba(15,23,42,0.06)] rounded-2xl p-5 shadow-sm"
        >
          <p className="text-xs font-medium text-[#64748b] uppercase tracking-wider mb-2" style={{ letterSpacing: '0.06em' }}>
            {s.label}
          </p>
          <p className="text-lg font-bold text-[#0F172A] tabular-nums" style={{ fontFamily: 'Space Grotesk' }}>
            {s.value}
          </p>
          {s.sub && <p className="text-xs text-[#94a3b8] tabular-nums mt-0.5">{s.sub}</p>}
        </div>
      ))}
    </div>
  )
}
