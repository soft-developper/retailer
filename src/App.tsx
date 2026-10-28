import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { api } from './lib/api'
import { getCurrentMerchantId, setCurrentMerchantId } from './lib/merchantStore'
import MerchantOnboarding from './pages/MerchantOnboarding'
import MerchantDashboard from './pages/MerchantDashboard'
import MerchantQR from './pages/MerchantQR'
import Checkout from './pages/Checkout'
import PaymentConfirmed from './pages/PaymentConfirmed'
import Landing from './pages/Landing'

// On app load, restore session from the httpOnly cookie via /auth/me
function useAuthRestore() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    api.me()
      .then((m) => { setCurrentMerchantId(m.id) })
      .catch(() => { /* not logged in — that's fine */ })
      .finally(() => setReady(true))
  }, [])
  return ready
}

function ProtectedDashboard({ children, ready }: { children: React.ReactNode; ready: boolean }) {
  if (!ready) {
    // Show nothing while the /auth/me check is in flight to avoid a flash redirect
    return <div className="min-h-dvh bg-[#FAFAF8]" />
  }
  const id = getCurrentMerchantId()
  if (!id) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const ready = useAuthRestore()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing authReady={ready} />} />
        <Route path="/onboarding" element={<MerchantOnboarding />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedDashboard ready={ready}>
              <MerchantDashboard />
            </ProtectedDashboard>
          }
        />
        <Route
          path="/dashboard/qr"
          element={
            <ProtectedDashboard ready={ready}>
              <MerchantQR />
            </ProtectedDashboard>
          }
        />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/pay-confirmed" element={<PaymentConfirmed />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
