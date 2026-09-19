import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../AuthContext'

const emptyForm = {
  id: null,
  sku: '',
  name: '',
  category: '',
  brand: '',
  cost_price: '',
  sale_price: '',
  quantity: '',
  low_stock_threshold: '3',
  supplier_id: '',
}

export default function Inventory() {
  const { canManageInventory } = useAuth()
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: prod, error: e1 }, { data: sup }] = await Promise.all([
      supabase.from('products').select('*, suppliers(name)').order('name'),
      supabase.from('suppliers').select('id, name').order('name'),
    ])
    if (e1) setError(e1.message)
    setProducts(prod || [])
    setSuppliers(sup || [])
    setLoading(false)
  }

  function openNew() {
    setForm(emptyForm)
    setShowForm(true)
    setError('')
  }

  function openEdit(p) {
    setForm({
      id: p.id,
      sku: p.sku || '',
      name: p.name || '',
      category: p.category || '',
      brand: p.brand || '',
      cost_price: p.cost_price,
      sale_price: p.sale_price,
      quantity: p.quantity,
      low_stock_threshold: p.low_stock_threshold,
      supplier_id: p.supplier_id || '',
    })
    setShowForm(true)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const payload = {
      sku: form.sku || null,
      name: form.name,
      category: form.category || null,
      brand: form.brand || null,
      cost_price: Number(form.cost_price) || 0,
      sale_price: Number(form.sale_price) || 0,
      quantity: Number(form.quantity) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 0,
      supplier_id: form.supplier_id || null,
    }
    let res
    if (form.id) {
      res = await supabase.from('products').update(payload).eq('id', form.id)
    } else {
      res = await supabase.from('products').insert(payload)
    }
    if (res.error) {
      setError(res.error.message)
      return
    }
    setShowForm(false)
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this product? This cannot be undone.')) return
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    return (
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.brand?.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          <p>Parts, laptops and stock levels</p>
        </div>
        {canManageInventory && (
          <button className="btn" onClick={openNew}>+ Add product</button>
        )}
      </div>

      <div className="actions-row">
        <div className="field" style={{ margin: 0, minWidth: 260 }}>
          <input
            type="text"
            placeholder="Search by name, SKU, category or brand…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <p style={{ padding: 20 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No products match. Try adding one.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>Supplier</th>
                <th className="num">Cost</th>
                <th className="num">Price</th>
                <th className="num">Stock</th>
                {canManageInventory && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="nums">{p.sku || '—'}</td>
                  <td>{p.name}{p.brand ? <span style={{ color: 'var(--text-dim)' }}> · {p.brand}</span> : null}</td>
                  <td>{p.category || '—'}</td>
                  <td>{p.suppliers?.name || '—'}</td>
                  <td className="num">{Number(p.cost_price).toFixed(2)}</td>
                  <td className="num">{Number(p.sale_price).toFixed(2)}</td>
                  <td className="num">
                    <span className={`badge ${p.quantity === 0 ? 'danger' : p.quantity <= p.low_stock_threshold ? 'warn' : 'good'}`}>
                      {p.quantity}
                    </span>
                  </td>
                  {canManageInventory && (
                    <td className="num">
                      <button className="btn secondary sm" onClick={() => openEdit(p)}>Edit</button>{' '}
                      <button className="btn danger sm" onClick={() => handleDelete(p.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginTop: 20, maxWidth: 560 }}>
          <h3 style={{ marginTop: 0 }}>{form.id ? 'Edit product' : 'Add product'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2">
              <div className="field">
                <label>Name *</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>SKU</label>
                <input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div className="field">
                <label>Category</label>
                <input type="text" placeholder="e.g. RAM, Laptop, Cable" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="field">
                <label>Brand</label>
                <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div className="field">
                <label>Cost price</label>
                <input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
              </div>
              <div className="field">
                <label>Sale price *</label>
                <input type="number" step="0.01" min="0" required value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
              </div>
              <div className="field">
                <label>Quantity on hand</label>
                <input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="field">
                <label>Low stock alert below</label>
                <input type="number" min="0" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Supplier</label>
                <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">— none —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="actions-row" style={{ marginTop: 4 }}>
              <button className="btn" type="submit">{form.id ? 'Save changes' : 'Add product'}</button>
              <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
