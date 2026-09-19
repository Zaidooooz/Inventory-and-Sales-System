import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function SalesHistory() {
  const [sales, setSales] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('sales')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setSales(data || [])
    setLoading(false)
  }

  async function toggleExpand(sale) {
    if (expanded === sale.id) {
      setExpanded(null)
      return
    }
    const { data } = await supabase
      .from('sale_items')
      .select('*, products(name, sku)')
      .eq('sale_id', sale.id)
    setItems(data || [])
    setExpanded(sale.id)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sales history</h1>
          <p>Every sale recorded, most recent first</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <p style={{ padding: 20 }}>Loading…</p>
        ) : sales.length === 0 ? (
          <div className="empty-state">No sales recorded yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice</th><th>Date</th><th>Customer</th><th>Method</th><th>Staff</th><th className="num">Total</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <React.Fragment key={s.id}>
                  <tr>
                    <td className="nums">{s.invoice_no}</td>
                    <td>{new Date(s.created_at).toLocaleString()}</td>
                    <td>{s.customer_name || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>
                      {s.payment_method}{s.installments ? ` (${s.installments}x)` : ''}
                    </td>
                    <td>{s.profiles?.full_name || '—'}</td>
                    <td className="num">{Number(s.total).toFixed(2)}</td>
                    <td className="num">
                      <button className="btn secondary sm" onClick={() => toggleExpand(s)}>
                        {expanded === s.id ? 'Hide' : 'Items'}
                      </button>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr>
                      <td colSpan={7} style={{ background: '#FAFBFC' }}>
                        {items.map((it) => (
                          <div key={it.id} style={{ fontSize: 12, padding: '2px 0' }}>
                            {it.quantity}× {it.products?.name} ({it.products?.sku || '—'}) — {Number(it.subtotal).toFixed(2)}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
