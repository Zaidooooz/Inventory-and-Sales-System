import { NavLink } from 'react-router-dom'
import { useAuth } from '../AuthContext'

const ROLE_LABELS = {
  admin: 'Admin',
  cashier: 'Cashier',
  inventory_manager: 'Inventory manager',
  pending: 'Pending approval',
}

export default function Sidebar() {
  const { profile, role, isAdmin, canManageInventory, signOut } = useAuth()

  return (
    <div className="sidebar">
      <div className="brand">
        <strong>Astrox</strong>
        <span>Inventory · Purchasing · Sales</span>
      </div>
      <nav>
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Dashboard</NavLink>
        <NavLink to="/sales" className={({ isActive }) => (isActive ? 'active' : '')}>New sale</NavLink>
        <NavLink to="/sales/history" className={({ isActive }) => (isActive ? 'active' : '')}>Sales history</NavLink>
        <NavLink to="/inventory" className={({ isActive }) => (isActive ? 'active' : '')}>Inventory</NavLink>
        {canManageInventory && (
          <>
            <NavLink to="/purchasing" className={({ isActive }) => (isActive ? 'active' : '')}>Purchasing</NavLink>
            <NavLink to="/suppliers" className={({ isActive }) => (isActive ? 'active' : '')}>Suppliers</NavLink>
          </>
        )}
        {isAdmin && (
          <NavLink to="/staff" className={({ isActive }) => (isActive ? 'active' : '')}>Staff</NavLink>
        )}
      </nav>
      <div className="user-box">
        <div>{profile?.full_name || 'Staff member'}</div>
        <span className="role-badge">{ROLE_LABELS[role] || role}</span>
      </div>
      <button className="signout" onClick={signOut}>Sign out</button>
    </div>
  )
}
