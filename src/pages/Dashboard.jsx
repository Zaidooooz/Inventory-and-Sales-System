import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Dashboard() {
  const [stats, setStats] = useState({
    productCount: 0,
    lowStockCount: 0,
    todaySalesTotal: 0,
    todaySalesCount: 0,
    pendingPOs: 0,
  })
  const [lowStockItems, setLowStockItems] = useState([])
  const [recentSales, setRecentSales] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const [{ data: products }, { data: sales }, { data: pos }] = await Promise.all([
      supabase.from('products').select('id, name, quantity, low_stock_threshold'),
      supabase.from('sales').select('id, total, created_at, invoice_no, payment_method').order('created_at', { ascending: false }).limit(200),
      supabase.from('purchase_orders').select('id').eq('status', 'pending'),
    ])

    const low = (products || []).filter((p) => p.quantity <= p.low_stock_threshold)
    const todays = (sales || []).filter((s) => new Date(s.created_at) >= startOfDay)

    setStats({
      productCount: products?.length || 0,
      lowStockCount: low.length,
      todaySalesTotal: todays.reduce((sum, s) => sum + Number(s.total), 0),
      todaySalesCount: todays.length,
      pendingPOs: pos?.length || 0,
    })
    setLowStockItems(low.slice(0, 6))
    setRecentSales((sales || []).slice(0, 6))
    setLoading(false)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Today's snapshot of the shop</p>
        </div>
      </div>

      <div className="grid grid-cols-4" style={{ marginBottom: 24 }}>
        <div className="card stat-card">
          <div className="label">Sales today</div>
          <div className="value nums">{stats.todaySalesCount}</div>
        </div>
        <div className="card stat-card good">
          <div className="label">Revenue today</div>
          <div className="value nums">{stats.todaySalesTotal.toFixed(2)}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Products tracked</div>
          <div className="value nums">{stats.productCount}</div>
        </div>
        <div className="card stat-card warn">
          <div className="label">Low stock items</div>
          <div className="value nums">{stats.lowStockCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Low stock</h3>
          {loading ? (
            <p>Loading…</p>
          ) : lowStockItems.length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>Nothing running low.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Product</th><th className="num">On hand</th></tr>
              </thead>
              <tbody>
                {lowStockItems.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="num">
                      <span className={`badge ${p.quantity === 0 ? 'danger' : 'warn'}`}>{p.quantity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {stats.pendingPOs > 0 && (
            <p style={{ marginTop: 12, fontSize: 13 }}>
              {stats.pendingPOs} purchase order{stats.pendingPOs > 1 ? 's' : ''} waiting to be received.
            </p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent sales</h3>
          {loading ? (
            <p>Loading…</p>
          ) : recentSales.length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>No sales recorded yet.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Invoice</th><th>Method</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {recentSales.map((s) => (
                  <tr key={s.id}>
                    <td className="nums">{s.invoice_no}</td>
                    <td style={{ textTransform: 'capitalize' }}>{s.payment_method}</td>
                    <td className="num">{Number(s.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
