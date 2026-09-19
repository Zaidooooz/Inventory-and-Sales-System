import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../AuthContext'

const ROLES = [
  { id: 'pending', label: 'Pending (no access)' },
  { id: 'admin', label: 'Admin' },
  { id: 'cashier', label: 'Cashier (sales only)' },
  { id: 'inventory_manager', label: 'Inventory manager' },
]

export default function Staff() {
  const { user } = useAuth()
  const [staff, setStaff] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('created_at')
    if (error) setError(error.message)
    setStaff(data || [])
    setLoading(false)
  }

  async function updateRole(id, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Staff</h1>
          <p>Approve new sign-ups and manage access levels</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <p style={{ padding: 20 }}>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Role</th><th>Joined</th><th></th></tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.full_name || '—'}
                    {s.id === user?.id && <span style={{ color: 'var(--text-dim)' }}> (you)</span>}
                  </td>
                  <td>
                    <span className={`badge ${s.role === 'pending' ? 'warn' : s.role === 'admin' ? 'neutral' : 'good'}`}>
                      {ROLES.find((r) => r.id === s.role)?.label || s.role}
                    </span>
                  </td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="num">
                    <select
                      value={s.role}
                      onChange={(e) => updateRole(s.id, e.target.value)}
                      disabled={s.id === user?.id}
                      style={{ maxWidth: 200 }}
                    >
                      {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12 }}>
        New staff create their own account from the sign-up tab on the login page, then show up here as
        "Pending" until you assign them a role.
      </p>
    </div>
  )
}
