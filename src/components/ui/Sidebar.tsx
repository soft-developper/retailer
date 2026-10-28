import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ShoppingBag, LayoutDashboard, QrCode, LogOut, Menu, X } from 'lucide-react'
import { clearCurrentMerchantId } from '../../lib/merchantStore'
import { api } from '../../lib/api'
import type { Merchant } from '../../lib/api'

interface Props {
  merchant: Merchant
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/dashboard/qr', icon: QrCode, label: 'QR Codes', exact: false },
]

interface NavContentProps {
  merchant: Merchant
  onClose?: () => void
  onLogout: () => void
}

function SidebarNavContent({ merchant, onClose, onLogout }: NavContentProps) {
  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-[rgba(15,23,42,0.06)]">
        <div className="w-8 h-8 bg-[#0F172A] rounded-lg flex items-center justify-center flex-shrink-0">
          <ShoppingBag size={15} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0F172A] truncate" style={{ fontFamily: 'Space Grotesk' }}>
            {merchant.name}
          </p>
          <p className="text-xs text-[#64748b] capitalize">{merchant.category}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
                isActive
                  ? 'bg-[#0F172A] text-white'
                  : 'text-[#334155] hover:bg-[rgba(15,23,42,0.05)] hover:text-[#0F172A]'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[rgba(15,23,42,0.06)]">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-[#64748b] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-all min-h-[44px]"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </>
  )
}

export default function Sidebar({ merchant }: Props) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function logout(): void {
    clearCurrentMerchantId()
    void api.logout().catch(() => {})
    void navigate('/')
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 min-h-dvh bg-white border-r border-[rgba(15,23,42,0.06)]">
        <SidebarNavContent merchant={merchant} onLogout={logout} />
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[rgba(15,23,42,0.06)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#0F172A] rounded-lg flex items-center justify-center">
            <ShoppingBag size={13} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-[#0F172A] truncate max-w-[140px]" style={{ fontFamily: 'Space Grotesk' }}>
            {merchant.name}
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg hover:bg-[rgba(15,23,42,0.05)] transition-colors"
        >
          <Menu size={20} className="text-[#334155]" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-64 bg-white flex flex-col h-full shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[rgba(15,23,42,0.05)] transition-colors"
            >
              <X size={18} className="text-[#64748b]" />
            </button>
            <SidebarNavContent merchant={merchant} onClose={() => setOpen(false)} onLogout={logout} />
          </div>
        </div>
      )}
    </>
  )
}
