import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function SalesHistory() {
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    const { data: sales } = await supabase
      .from('sales')
      .select('id, invoice_no, customer_name, payment_method, installments, created_at, profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(300)

    const saleIds = (sales || []).map((s) => s.id)
    let flatRows = []

    if (saleIds.length > 0) {
      const { data: items } = await supabase
        .from('sale_items')
        .select('id, quantity, unit_price, sale_id, products(name, sku, cost_price)')
        .in('sale_id', saleIds)

      const salesById = Object.fromEntries((sales || []).map((s) => [s.id, s]))
      flatRows = (items || [])
        .map((it) => ({ ...it, sale: salesById[it.sale_id] }))
        .filter((it) => it.sale)
        .sort((a, b) => new Date(b.sale.created_at) - new Date(a.sale.created_at))
    }

    setRows(flatRows)
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      r.products?.name?.toLowerCase().includes(q) ||
      r.products?.sku?.toLowerCase().includes(q) ||
      r.sale?.customer_name?.toLowerCase().includes(q) ||
      r.sale?.payment_method?.toLowerCase().includes(q) ||
      r.sale?.invoice_no?.toLowerCase().includes(q)
    )
  }, [rows, search])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sales history</h1>
          <p>Every item sold, most recent first</p>
        </div>
      </div>

      <div className="actions-row">
        <div className="field" style={{ margin: 0, minWidth: 260 }}>
          <input
            type="text"
            placeholder="Search by product, customer, payment method or invoice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <p style={{ padding: 20 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No sales match.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Customer</th>
                <th>Payment method</th>
                <th className="num">Cost price</th>
                <th className="num">Sold price</th>
                <th className="num">Qty</th>
                <th>Staff</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.sale.created_at).toLocaleString()}</td>
                  <td>
                    {r.products?.name || '—'}
                    {r.products?.sku ? <span style={{ color: 'var(--text-dim)' }}> ({r.products.sku})</span> : null}
                  </td>
                  <td>{r.sale.customer_name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>
                    {r.sale.payment_method}{r.sale.installments ? ` (${r.sale.installments}x)` : ''}
                  </td>
                  <td className="num">{Number(r.products?.cost_price ?? 0).toFixed(2)}</td>
                  <td className="num">{Number(r.unit_price).toFixed(2)}</td>
                  <td className="num">{r.quantity}</td>
                  <td>{r.sale.profiles?.full_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
