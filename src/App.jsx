import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Purchasing from './pages/Purchasing'
import Suppliers from './pages/Suppliers'
import Sales from './pages/Sales'
import SalesHistory from './pages/SalesHistory'
import Staff from './pages/Staff'

function Shell() {
  const { session, loading, isApproved, isAdmin, canManageInventory, signOut, profile } = useAuth()

  if (loading) {
    return <div className="login-shell"><div style={{ color: '#fff' }}>Loading…</div></div>
  }

  if (!session) {
    return <Login />
  }

  if (!isApproved) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Almost there</h1>
          <p className="sub">
            Hi {profile?.full_name || ''}, your account is waiting for an admin to approve it and assign a
            role. Check back soon.
          </p>
          <button className="btn secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/sales/history" element={<SalesHistory />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route
            path="/purchasing"
            element={canManageInventory ? <Purchasing /> : <Navigate to="/" replace />}
          />
          <Route
            path="/suppliers"
            element={canManageInventory ? <Suppliers /> : <Navigate to="/" replace />}
          />
          <Route path="/staff" element={isAdmin ? <Staff /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  )
}
