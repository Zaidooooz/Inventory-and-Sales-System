import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const empty = { id: null, name: '', phone: '', email: '', address: '' }

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [form, setForm] = useState(empty)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('suppliers').select('*').order('name')
    if (error) setError(error.message)
    setSuppliers(data || [])
    setLoading(false)
  }

  function openEdit(s) {
    setForm(s)
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const payload = { name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null }
    const res = form.id
      ? await supabase.from('suppliers').update(payload).eq('id', form.id)
      : await supabase.from('suppliers').insert(payload)
    if (res.error) { setError(res.error.message); return }
    setShowForm(false)
    setForm(empty)
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this supplier?')) return
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Suppliers</h1>
          <p>Where your stock comes from</p>
        </div>
        <button className="btn" onClick={() => { setForm(empty); setShowForm(true) }}>+ Add supplier</button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <p style={{ padding: 20 }}>Loading…</p>
        ) : suppliers.length === 0 ? (
          <div className="empty-state">No suppliers yet.</div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th></th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.phone || '—'}</td>
                  <td>{s.email || '—'}</td>
                  <td>{s.address || '—'}</td>
                  <td className="num">
                    <button className="btn secondary sm" onClick={() => openEdit(s)}>Edit</button>{' '}
                    <button className="btn danger sm" onClick={() => handleDelete(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginTop: 20, maxWidth: 480 }}>
          <h3 style={{ marginTop: 0 }}>{form.id ? 'Edit supplier' : 'Add supplier'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Name *</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input type="tel" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Address</label>
              <textarea rows={2} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="actions-row">
              <button className="btn" type="submit">{form.id ? 'Save changes' : 'Add supplier'}</button>
              <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
