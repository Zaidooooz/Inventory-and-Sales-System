import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Purchasing() {
  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState([{ product_id: '', quantity: 1, unit_cost: '' }])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: po }, { data: sup }, { data: prod }] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('*, suppliers(name), purchase_order_items(id, quantity, unit_cost, products(name, sku))')
        .order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('products').select('id, name, sku, cost_price').eq('is_active', true).order('name'),
    ])
    setOrders(po || [])
    setSuppliers(sup || [])
    setProducts(prod || [])
    setLoading(false)
  }

  function addLine() {
    setLines([...lines, { product_id: '', quantity: 1, unit_cost: '' }])
  }

  function updateLine(idx, field, value) {
    const next = [...lines]
    next[idx][field] = value
    if (field === 'product_id') {
      const p = products.find((p) => p.id === value)
      if (p) next[idx].unit_cost = p.cost_price
    }
    setLines(next)
  }

  function removeLine(idx) {
    setLines(lines.filter((_, i) => i !== idx))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    const validLines = lines.filter((l) => l.product_id && Number(l.quantity) > 0)
    if (!supplierId || validLines.length === 0) {
      setError('Choose a supplier and at least one product line.')
      return
    }
    setBusy(true)
    const totalCost = validLines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_cost || 0), 0)

    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .insert({ supplier_id: supplierId, total_cost: totalCost, status: 'pending' })
      .select()
      .single()

    if (poError) { setError(poError.message); setBusy(false); return }

    const items = validLines.map((l) => ({
      purchase_order_id: po.id,
      product_id: l.product_id,
      quantity: Number(l.quantity),
      unit_cost: Number(l.unit_cost || 0),
    }))
    const { error: itemsError } = await supabase.from('purchase_order_items').insert(items)
    setBusy(false)
    if (itemsError) { setError(itemsError.message); return }

    setShowForm(false)
    setSupplierId('')
    setLines([{ product_id: '', quantity: 1, unit_cost: '' }])
    load()
  }

  async function handleReceive(id) {
    if (!confirm('Mark this order as received? Stock quantities will be updated.')) return
    const { error } = await supabase.rpc('receive_purchase_order', { p_po_id: id })
    if (error) setError(error.message)
    else load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Purchasing</h1>
          <p>Order stock from suppliers and receive it into inventory</p>
        </div>
        <button className="btn" onClick={() => setShowForm(true)}>+ New purchase order</button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>New purchase order</h3>
          <form onSubmit={handleCreate}>
            <div className="field" style={{ maxWidth: 320 }}>
              <label>Supplier *</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                <option value="">Select supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <label style={{ marginTop: 10 }}>Items</label>
            {lines.map((line, idx) => (
              <div key={idx} className="cart-line" style={{ gap: 8 }}>
                <select
                  style={{ flex: 2 }}
                  value={line.product_id}
                  onChange={(e) => updateLine(idx, 'product_id', e.target.value)}
                >
                  <option value="">Select product…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>)}
                </select>
                <input
                  type="number" min="1" placeholder="Qty" style={{ width: 70 }}
                  value={line.quantity}
                  onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                />
                <input
                  type="number" min="0" step="0.01" placeholder="Unit cost" style={{ width: 100 }}
                  value={line.unit_cost}
                  onChange={(e) => updateLine(idx, 'unit_cost', e.target.value)}
                />
                <button type="button" className="btn secondary sm" onClick={() => removeLine(idx)}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn secondary sm" style={{ marginTop: 10 }} onClick={addLine}>+ Add line</button>

            <div className="actions-row" style={{ marginTop: 18 }}>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create order'}</button>
              <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <p style={{ padding: 20 }}>Loading…</p>
        ) : orders.length === 0 ? (
          <div className="empty-state">No purchase orders yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Supplier</th><th>Items</th><th className="num">Total cost</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id}>
                  <td>{po.suppliers?.name || '—'}</td>
                  <td>
                    {po.purchase_order_items.map((it) => (
                      <div key={it.id} style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {it.quantity}× {it.products?.name}
                      </div>
                    ))}
                  </td>
                  <td className="num">{Number(po.total_cost).toFixed(2)}</td>
                  <td>
                    <span className={`badge ${po.status === 'received' ? 'good' : po.status === 'cancelled' ? 'danger' : 'warn'}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="num">
                    {po.status === 'pending' && (
                      <button className="btn sm" onClick={() => handleReceive(po.id)}>Receive stock</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
