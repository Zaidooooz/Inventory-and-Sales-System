import { methodLabel, money } from '../constants'

// Shows a positive balance / negative balance as a coloured badge.
export function BalanceBadge({ balance, owedText, advanceText }) {
  const b = Number(balance || 0)
  if (Math.abs(b) < 0.005) return <span className="badge neutral">Settled</span>
  if (b > 0) return <span className="badge warn">{owedText} {money(b)}</span>
  return <span className="badge good">{advanceText} {money(-b)}</span>
}

// A statement: every ledger entry with a running balance.
export default function LedgerStatement({ title, entries, kindLabels, owedText, advanceText, onClose }) {
  let running = 0
  const rows = (entries || []).map((e) => {
    running += Number(e.amount)
    return { ...e, running }
  })
  const balance = running

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <BalanceBadge balance={balance} owedText={owedText} advanceText={advanceText} />
          <button className="btn secondary sm" onClick={onClose}>Close</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">Nothing recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Type</th><th>Method</th><th>Note</th>
              <th className="num">Amount</th><th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{kindLabels[r.kind] || r.kind}</td>
                <td>{r.method ? methodLabel(r.method) : '—'}</td>
                <td>{r.note || '—'}</td>
                <td className="num">{Number(r.amount) > 0 ? '+' : ''}{money(r.amount)}</td>
                <td className="num">{money(r.running)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
