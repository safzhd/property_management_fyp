import type {
  Transaction, CreateTransactionPayload,
  TransactionSummary, PropertyPnL,
  TransactionType, TransactionCategory, TransactionStatus
} from '@/types/transaction'

const BASE = '/api/transactions'

export async function getTransactions(params?: {
  propertyId?: string
  tenancyId?:  string
  type?:       TransactionType
  category?:   TransactionCategory
  status?:     TransactionStatus
  year?:       number
}): Promise<Transaction[]> {
  const qs = params ? '?' + new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  ).toString() : ''
  const res = await fetch(`${BASE}${qs}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })
  if (!res.ok) throw new Error('Failed to fetch transactions')
  const data = await res.json()
  return data.transactions
}

export async function getTransactionSummary(year?: number): Promise<{
  year: number
  summary: TransactionSummary
  byProperty: PropertyPnL[]
  upcoming: Transaction[]
}> {
  const qs = year ? `?year=${year}` : ''
  const res = await fetch(`${BASE}/summary${qs}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })
  if (!res.ok) throw new Error('Failed to fetch summary')
  return res.json()
}

export async function createTransaction(payload: CreateTransactionPayload): Promise<Transaction> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to create transaction')
  }
  const data = await res.json()
  return data.transaction
}

export async function updateTransaction(id: string, payload: Partial<CreateTransactionPayload>): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to update transaction')
}

export async function deleteTransaction(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })
  if (!res.ok) throw new Error('Failed to delete transaction')
}

export function getExportUrl(year: number, propertyId?: string) {
  const qs = new URLSearchParams({ year: String(year) })
  if (propertyId) qs.set('propertyId', propertyId)
  return `${BASE}/export?${qs.toString()}`
}
