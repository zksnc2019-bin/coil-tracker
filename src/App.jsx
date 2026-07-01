import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import CEODashboard    from './pages/dashboard/CEODashboard'
import FinanceDashboard from './pages/dashboard/FinanceDashboard'
import ManagerDashboard from './pages/dashboard/ManagerDashboard'
import POList    from './pages/po/POList'
import WorkOrderList from './pages/workorder/WorkOrderList'
import DeliveryList  from './pages/delivery/DeliveryList'
import InventoryList from './pages/inventory/InventoryList'
import PurchaseList  from './pages/purchase/PurchaseList'
import PaymentList   from './pages/payment/PaymentList'
import CoilTrace     from './pages/trace/CoilTrace'
import VendorList    from './pages/master/VendorList'
import SiteList      from './pages/master/SiteList'
import AuditLog      from './pages/system/AuditLog'

function PrivateRoute({ children, user }) {
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(undefined)  // undefined = 로딩중

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (user === undefined) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <HashRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<PrivateRoute user={user}><Layout user={user} /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard/ceo" replace />} />
          <Route path="dashboard/ceo"     element={<CEODashboard />} />
          <Route path="dashboard/finance" element={<FinanceDashboard />} />
          <Route path="dashboard/manager" element={<ManagerDashboard />} />
          <Route path="po"         element={<POList />} />
          <Route path="workorder"  element={<WorkOrderList />} />
          <Route path="delivery"   element={<DeliveryList />} />
          <Route path="inventory"  element={<InventoryList />} />
          <Route path="purchase"   element={<PurchaseList />} />
          <Route path="payment"    element={<PaymentList />} />
          <Route path="trace"      element={<CoilTrace />} />
          <Route path="vendors"    element={<VendorList />} />
          <Route path="sites"      element={<SiteList />} />
          <Route path="audit"      element={<AuditLog />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
