import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell,
} from 'recharts'
import { supabase } from '../supabaseClient'

export default function Dashboard() {
  const [stats, setStats] = useState({
    productCount: 0,
    lowStockCount: 0,
    todaySalesTotal: 0,
    todaySalesCount: 0,
    pendingPOs: 0,
  })
  const [salesByDay, setSalesByDay] = useState([])
  const [stockData, setStockData] = useState([])
  const [recentItems, setRecentItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const [{ data: products }, { data: sales }, { data: pos }] = await Promise.all([
      supabase.from('products').select('id, name, quantity, low_stock_threshold').order('quantity'),
      supabase.from('sales').select('id, total, created_at, payment_method').order('created_at', { ascending: false }).limit(500),
      supabase.from('purchase_orders').select('id').eq('status', 'pending'),
    ])

    // ---- stat cards ----
    const low = (products || []).filter((p) => p.quantity <= p.low_stock_threshold)
    const todays = (sales || []).filter((s) => new Date(s.created_at) >= startOfDay)

    setStats({
      productCount: products?.length || 0,
      lowStockCount: low.length,
      todaySalesTotal: todays.reduce((sum, s) => sum + Number(s.total), 0),
      todaySalesCount: todays.length,
      pendingPOs: pos?.length || 0,
    })

    // ---- line chart: revenue for the last 7 days ----
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      days.push(d)
    }
    const dailyTotals = days.map((d) => {
      const next = new Date(d)
      next.setDate(d.getDate() + 1)
      const total = (sales || [])
        .filter((s) => {
          const t = new Date(s.created_at)
          return t >= d && t < next
        })
        .reduce((sum, s) => sum + Number(s.total), 0)
      return {
        date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        total: Number(total.toFixed(2)),
      }
    })
    setSalesByDay(dailyTotals)

    // ---- bar chart: stock on hand per product (lowest stock first, top 10) ----
    setStockData((products || []).slice(0, 10))

    // ---- recent items sold table ----
    const { data: recentSales } = await supabase
      .from('sales')
      .select('id, payment_method, created_at')
      .order('created_at', { ascending: false })
      .limit(6)

    const saleIds = (recentSales || []).map((s) => s.id)
    let items = []
    if (saleIds.length > 0) {
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('id, quantity, unit_price, sale_id, products(name, cost_price)')
        .in('sale_id', saleIds)

      const salesById = Object.fromEntries((recentSales || []).map((s) => [s.id, s]))
      items = (saleItems || [])
        .map((it) => ({ ...it, sale: salesById[it.sale_id] }))
        .filter((it) => it.sale)
        .sort((a, b) => new Date(b.sale.created_at) - new Date(a.sale.created_at))
        .slice(0, 8)
    }
    setRecentItems(items)

    setLoading(false)
  }

  const barColor = (p) => (p.quantity === 0 ? '#D64545' : p.quantity <= p.low_stock_threshold ? '#E8912D' : '#2A5EF5')

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

      <div className="grid grid-cols-2" style={{ marginBottom: 24, alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Sales — last 7 days</h3>
          {loading ? (
            <p>Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={salesByDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#E3E6EA" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#666D78' }} axisLine={{ stroke: '#DFE3E8' }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#666D78' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [Number(v).toFixed(2), 'Revenue']}
                  contentStyle={{ fontSize: 12, borderRadius: 4, border: '1px solid #DFE3E8' }}
                />
                <Line type="monotone" dataKey="total" stroke="#2A5EF5" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Stock on hand</h3>
          {loading ? (
            <p>Loading…</p>
          ) : stockData.length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>No products yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stockData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#E3E6EA" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#666D78' }} axisLine={{ stroke: '#DFE3E8' }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 12, fill: '#666D78' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4, border: '1px solid #DFE3E8' }} />
                <Bar dataKey="quantity" radius={[3, 3, 0, 0]}>
                  {stockData.map((p, i) => (
                    <Cell key={i} fill={barColor(p)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recently sold</h3>
        {loading ? (
          <p>Loading…</p>
        ) : recentItems.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>No sales recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Payment method</th>
                <th className="num">Cost price</th>
                <th className="num">Sold price</th>
                <th className="num">Qty</th>
              </tr>
            </thead>
            <tbody>
              {recentItems.map((it) => (
                <tr key={it.id}>
                  <td>{it.products?.name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{it.sale?.payment_method}</td>
                  <td className="num">{Number(it.products?.cost_price ?? 0).toFixed(2)}</td>
                  <td className="num">{Number(it.unit_price).toFixed(2)}</td>
                  <td className="num">{it.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
