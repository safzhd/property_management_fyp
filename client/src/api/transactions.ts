import { api } from '@/lib/axios'
import type {
  Transaction, CreateTransactionPayload,
  TransactionSummary, PropertyPnL,
  TransactionType, TransactionCategory, TransactionStatus
} from '@/types/transaction'

export async function getTransactions(params?: {
  propertyId?: string
  tenancyId?:  string
  type?:       TransactionType
  category?:   TransactionCategory
  status?:     TransactionStatus
  year?:       number
  yearFrom?:   number
  yearTo?:     number
}): Promise<Transaction[]> {
  const { data } = await api.get<{ transactions: Transaction[] }>('/transactions', { params })
  return data.transactions
}

export async function getTransactionSummary(params: { yearFrom: number; yearTo: number }): Promise<{
  yearFrom: number
  yearTo:   number
  summary:  TransactionSummary
  byProperty: PropertyPnL[]
  upcoming: Transaction[]
}> {
  const { data } = await api.get('/transactions/summary', { params })
  return data
}

export async function createTransaction(payload: CreateTransactionPayload): Promise<Transaction> {
  const { data } = await api.post<{ transaction: Transaction }>('/transactions', payload)
  return data.transaction
}

export async function updateTransaction(id: string, payload: Partial<CreateTransactionPayload>): Promise<void> {
  await api.patch(`/transactions/${id}`, payload)
}

export async function deleteTransaction(id: string): Promise<void> {
  await api.delete(`/transactions/${id}`)
}

export function getExportUrl(yearFrom: number, yearTo: number, propertyId?: string) {
  const qs = new URLSearchParams({ yearFrom: String(yearFrom), yearTo: String(yearTo) })
  if (propertyId) qs.set('propertyId', propertyId)
  return `/api/transactions/export?${qs.toString()}`
}
