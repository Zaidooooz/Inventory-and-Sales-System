import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const PAYMENT_METHODS = [
  { id: 'cash', name: 'Cash', tag: 'Paid in person' },
  { id: 'debit', name: 'Debit card', tag: 'Card terminal' },
  { id: 'credit', name: 'Credit card', tag: 'Card terminal' },
  { id: 'bank', name: 'Bank transfer', tag: 'Direct transfer' },
  { id: 'tabby', name: 'Tabby', tag: 'Installments', installment: true },
  { id: 'tamara', name: 'Tamara', tag: 'Installments', installment: true },
]

export default function Sales() {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [discount, setDiscount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [installments, setInstallments] = useState(3)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastSale, setLastSale] = useState(null)

  useEffect(() => { loadProducts() }, [])

  async function loadProducts() {
    const { data } = await supabase.from('products').select('id, name, sku, sale_price, quantity').order('name')
    setProducts(data || [])
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return []
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [search, products])

  function addToCart(p) {
    if (p.quantity <= 0) return
    setCart((prev) => {
      const existing = prev.find((l) => l.product_id === p.id)
      if (existing) {
        if (existing.quantity >= p.quantity) return prev
        return prev.map((l) => (l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [...prev, { product_id: p.id, name: p.name, sku: p.sku, unit_price: p.sale_price, quantity: 1, maxQty: p.quantity }]
    })
    setSearch('')
  }

  function updateQty(productId, qty) {
    setCart((prev) =>
      prev.map((l) => (l.product_id === productId ? { ...l, quantity: Math.max(1, Math.min(qty, l.maxQty)) } : l))
    )
  }

  function removeLine(productId) {
    setCart((prev) => prev.filter((l) => l.product_id !== productId))
  }

  const subtotal = cart.reduce((sum, l) => sum + l.unit_price * l.quantity, 0)
  const total = Math.max(0, subtotal - Number(discount || 0))
  const method = PAYMENT_METHODS.find((m) => m.id === paymentMethod)

  async function handleCompleteSale() {
    setError('')
    if (cart.length === 0) {
      setError('Add at least one item to the sale.')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('create_sale', {
      p_customer_name: customerName || null,
      p_customer_phone: customerPhone || null,
      p_discount: Number(discount || 0),
      p_payment_method: paymentMethod,
      p_installments: method?.installment ? Number(installments) : null,
      p_items: cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })),
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setLastSale({ id: data, total, method: method.name, installments: method.installment ? installments : null })
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setDiscount('0')
    setPaymentMethod('cash')
    loadProducts()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>New sale</h1>
          <p>Ring up a sale and take payment</p>
        </div>
      </div>

      {lastSale && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--good)' }}>
          Sale completed — total <strong className="nums">{lastSale.total.toFixed(2)}</strong> via {lastSale.method}
          {lastSale.installments ? ` (${lastSale.installments} installments)` : ''}.
          <button className="btn secondary sm" style={{ marginLeft: 12 }} onClick={() => setLastSale(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Items</h3>
          <div className="field" style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search product by name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {filtered.length > 0 && (
              <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, padding: 4 }}>
                {filtered.map((p) => (
                  <div
                    key={p.id}
                    style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                    onClick={() => addToCart(p)}
                  >
                    <span>{p.name} {p.sku ? <span style={{ color: 'var(--text-dim)' }}>({p.sku})</span> : ''}</span>
                    <span className="nums">{Number(p.sale_price).toFixed(2)} · {p.quantity} in stock</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>No items added yet.</p>
          ) : (
            <div>
              {cart.map((l) => (
                <div key={l.product_id} className="cart-line">
                  <span className="name">{l.name}</span>
                  <input
                    type="number" min="1" max={l.maxQty}
                    value={l.quantity}
                    onChange={(e) => updateQty(l.product_id, Number(e.target.value))}
                  />
                  <span className="nums" style={{ width: 70, textAlign: 'right' }}>{(l.unit_price * l.quantity).toFixed(2)}</span>
                  <button className="btn secondary sm" onClick={() => removeLine(l.product_id)}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="field">
              <label>Customer name</label>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="field">
              <label>Customer phone</label>
              <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <div className="field">
              <label>Discount</label>
              <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Payment</h3>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>Subtotal</span><span className="nums">{subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>Discount</span><span className="nums">-{Number(discount || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 600, marginTop: 8 }}>
              <span>Total</span><span className="nums">{total.toFixed(2)}</span>
            </div>
          </div>

          <label>Payment method</label>
          <div className="pay-methods" style={{ marginBottom: 16 }}>
            {PAYMENT_METHODS.map((m) => (
              <div
                key={m.id}
                className={`pay-method ${m.installment ? 'installment' : ''} ${paymentMethod === m.id ? 'selected' : ''}`}
                onClick={() => setPaymentMethod(m.id)}
              >
                <div className="name">{m.name}</div>
                <div className="tag">{m.tag}</div>
              </div>
            ))}
          </div>

          {method?.installment && (
            <div className="field" style={{ maxWidth: 200 }}>
              <label>Number of installments</label>
              <select value={installments} onChange={(e) => setInstallments(e.target.value)}>
                <option value={3}>3 payments</option>
                <option value={4}>4 payments</option>
                <option value={6}>6 payments</option>
              </select>
            </div>
          )}

          {error && <p className="error-text">{error}</p>}

          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy} onClick={handleCompleteSale}>
            {busy ? 'Processing…' : `Complete sale · ${total.toFixed(2)}`}
          </button>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
            This records the chosen payment method against the sale. Card, bank transfer and installment
            payments are still collected through your usual terminal, bank app or Tabby/Tamara device — this
            screen doesn't move money itself.
          </p>
        </div>
      </div>
    </div>
  )
}
