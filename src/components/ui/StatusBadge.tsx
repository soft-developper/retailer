interface Props {
  status: string
  size?: 'sm' | 'md'
}

const MAP: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: 'Confirmed', className: 'bg-[#DCFCE7] text-[#16A34A]' },
  PENDING:   { label: 'Pending',   className: 'bg-[#FEF9C3] text-[#CA8A04]' },
  OPEN:      { label: 'Open',      className: 'bg-[#EFF6FF] text-[#2563EB]' },
  FAILED:    { label: 'Failed',    className: 'bg-[#FEF2F2] text-[#DC2626]' },
  EXPIRED:   { label: 'Expired',   className: 'bg-[rgba(15,23,42,0.06)] text-[#64748b]' },
}

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const cfg = MAP[status] ?? { label: status, className: 'bg-[rgba(15,23,42,0.06)] text-[#64748b]' }
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${cfg.className} ${
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      {cfg.label}
    </span>
  )
}
