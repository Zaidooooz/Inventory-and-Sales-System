// All payment methods the shop accepts. The ids are what is stored in the database.
// NOTE: 'credit' = credit CARD (kept for old sales). 'on_credit' = customer pays later.
export const PAYMENT_METHODS = [
  { id: 'cash', name: 'Cash', tag: 'Paid in person' },
  { id: 'debit', name: 'Debit card', tag: 'Card terminal' },
  { id: 'credit', name: 'Credit card', tag: 'Card terminal' },
  { id: 'bank', name: 'Bank transfer', tag: 'Direct transfer' },
  { id: 'altaf_bank', name: "Altaf's Bank", tag: 'Bank account' },
  { id: 'kafeel_bank', name: 'Kafeel Bank', tag: 'Bank account' },
  { id: 'tabby', name: 'Tabby', tag: 'Installments', installment: true },
  { id: 'tamara', name: 'Tamara', tag: 'Installments', installment: true },
  { id: 'on_credit', name: 'Credit (pay later)', tag: 'Added to customer balance', payLater: true },
]

// Ways money can really change hands (everything except "pay later")
export const MONEY_METHODS = PAYMENT_METHODS.filter((m) => !m.payLater)

export function methodLabel(id) {
  if (id === 'credit_adjust') return "Reduce customer's credit balance"
  return PAYMENT_METHODS.find((m) => m.id === id)?.name ?? id ?? '—'
}

export const REPAIR_STATUSES = [
  { id: 'received', label: 'Received', badge: 'neutral' },
  { id: 'diagnosing', label: 'Diagnosing', badge: 'neutral' },
  { id: 'waiting_parts', label: 'Waiting for parts', badge: 'warn' },
  { id: 'in_progress', label: 'In progress', badge: 'neutral' },
  { id: 'ready', label: 'Ready for pickup', badge: 'good' },
  { id: 'delivered', label: 'Delivered', badge: 'good' },
  { id: 'cancelled', label: 'Cancelled', badge: 'danger' },
]

export const money = (n) => Number(n ?? 0).toFixed(2)

// Adds up ledger rows per id -> { id: balance }
export function balancesBy(rows, key) {
  const out = {}
  for (const r of rows || []) out[r[key]] = (out[r[key]] || 0) + Number(r.amount)
  return out
}
