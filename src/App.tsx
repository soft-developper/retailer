import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getCurrentMerchantId } from './lib/merchantStore'
import MerchantOnboarding from './pages/MerchantOnboarding'
import MerchantDashboard from './pages/MerchantDashboard'
import MerchantQR from './pages/MerchantQR'
import Checkout from './pages/Checkout'
import PaymentConfirmed from './pages/PaymentConfirmed'
import Landing from './pages/Landing'

function ProtectedDashboard({ children }: { children: React.ReactNode }) {
  const id = getCurrentMerchantId()
  if (!id) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/onboarding" element={<MerchantOnboarding />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedDashboard>
              <MerchantDashboard />
            </ProtectedDashboard>
          }
        />
        <Route
          path="/dashboard/qr"
          element={
            <ProtectedDashboard>
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
