import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Download, TrendingUp, TrendingDown, PoundSterling,
  Clock, Search, Trash2, ChevronDown
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTransactions, getTransactionSummary, deleteTransaction, getExportUrl } from '@/api/transactions'
import { ALL_CATEGORY_LABELS } from '@/types/transaction'
import type { Transaction, TransactionType } from '@/types/transaction'
import AddTransactionModal from './AddTransactionModal'
import { toast } from 'sonner'

const TYPE_FILTERS: { label: string; value: string }[] = [
  { label: 'All',      value: '' },
  { label: 'Income',   value: 'income' },
  { label: 'Expense',  value: 'expense' },
]

const STATUS_STYLES: Record<string, string> = {
  paid:       'bg-emerald-50 text-emerald-700 border border-emerald-200',
  pending:    'bg-yellow-50 text-yellow-700 border border-yellow-200',
  partial:    'bg-blue-50 text-blue-700 border border-blue-200',
  late:       'bg-red-50 text-red-600 border border-red-200',
  failed:     'bg-red-50 text-red-600 border border-red-200',
  refunded:   'bg-purple-50 text-purple-700 border border-purple-200',
  reconciled: 'bg-gray-100 text-gray-600 border border-gray-200',
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(n)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function SummaryCard({
  label, amount, sub, icon: Icon, colour,
}: {
  label: string; amount: number; sub?: string; icon: React.ElementType; colour: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', colour)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900">{formatCurrency(amount)}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function TransactionRow({
  tx,
  onDelete,
}: {
  tx: Transaction
  onDelete: (id: string) => void
}) {
  const isIncome = tx.type === 'income'

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors group">
      {/* Type indicator */}
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
        isIncome ? 'bg-emerald-50' : 'bg-red-50'
      )}>
        {isIncome
          ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
      </div>

      {/* Description + category */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {tx.description || ALL_CATEGORY_LABELS[tx.category]}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {ALL_CATEGORY_LABELS[tx.category]}
          {tx.supplier ? ` · ${tx.supplier}` : ''}
          {tx.property ? ` · ${tx.property}` : ''}
        </p>
      </div>

      {/* Date */}
      <p className="text-xs text-gray-400 shrink-0 hidden sm:block">{formatDate(tx.date)}</p>

      {/* Status */}
      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full shrink-0 hidden sm:inline-flex', STATUS_STYLES[tx.status])}>
        {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
      </span>

      {/* Amount */}
      <p className={cn(
        'text-sm font-bold shrink-0 w-24 text-right',
        isIncome ? 'text-emerald-600' : 'text-red-500'
      )}>
        {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
      </p>

      {/* Delete */}
      <button
        onClick={() => onDelete(tx.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export default function TransactionsPage() {
  const queryClient = useQueryClient()
  const currentYear = new Date().getFullYear()

  const [showModal, setShowModal]   = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch]         = useState('')
  const [year, setYear]             = useState(currentYear)

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', typeFilter, year],
    queryFn:  () => getTransactions({
      type: typeFilter as TransactionType || undefined,
      year,
    }),
  })

  const { data: summaryData } = useQuery({
    queryKey: ['transaction-summary', year],
    queryFn:  () => getTransactionSummary(year),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transaction-summary'] })
      toast.success('Transaction deleted')
    },
    onError: () => toast.error('Failed to delete transaction'),
  })

  const filtered = transactions.filter(tx => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (tx.description ?? '').toLowerCase().includes(q) ||
      (tx.supplier ?? '').toLowerCase().includes(q) ||
      (tx.property ?? '').toLowerCase().includes(q) ||
      ALL_CATEGORY_LABELS[tx.category].toLowerCase().includes(q)
    )
  })

  const summary = summaryData?.summary

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  function handleExport() {
    const url = getExportUrl(year)
    const token = localStorage.getItem('token')
    // Fetch with auth then trigger download
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `transactions-${year}.csv`
        a.click()
      })
      .catch(() => toast.error('Export failed'))
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading ? 'Loading…' : `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} in ${year}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Year picker */}
          <div className="relative">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Transaction
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Income"
          amount={summary?.total_income ?? 0}
          sub={`${year}`}
          icon={TrendingUp}
          colour="bg-emerald-50 text-emerald-600"
        />
        <SummaryCard
          label="Total Expenses"
          amount={summary?.total_expenses ?? 0}
          sub={`${year}`}
          icon={TrendingDown}
          colour="bg-red-50 text-red-500"
        />
        <SummaryCard
          label="Net Profit"
          amount={summary?.net_profit ?? 0}
          sub="Income minus expenses"
          icon={PoundSterling}
          colour={(summary?.net_profit ?? 0) >= 0 ? 'bg-sky-50 text-sky-600' : 'bg-orange-50 text-orange-500'}
        />
        <SummaryCard
          label="Outstanding"
          amount={summary?.outstanding ?? 0}
          sub="Pending / unpaid"
          icon={Clock}
          colour="bg-yellow-50 text-yellow-600"
        />
      </div>

      {/* Per-property P&L */}
      {summaryData?.byProperty && summaryData.byProperty.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">P&L By Property — {year}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {summaryData.byProperty.map(p => (
              <div key={p.property_id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <p className="flex-1 font-medium text-gray-800 truncate">{p.property_name}</p>
                <p className="text-emerald-600 font-medium w-24 text-right">{formatCurrency(p.income)}</p>
                <p className="text-red-500 font-medium w-24 text-right">-{formatCurrency(p.expenses)}</p>
                <p className={cn(
                  'font-bold w-24 text-right',
                  p.net_profit >= 0 ? 'text-sky-600' : 'text-red-600'
                )}>
                  {formatCurrency(p.net_profit)}
                </p>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 text-xs text-gray-400">
            <span className="text-emerald-600 font-medium w-24 text-right">Income</span>
            <span className="text-red-500 font-medium w-24 text-right">Expenses</span>
            <span className="text-sky-600 font-medium w-24 text-right">Net</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search description, supplier, property…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>
        <div className="flex gap-1.5">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                typeFilter === f.value
                  ? 'bg-sky-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-sky-300'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-gray-200 bg-white">
          <PoundSterling className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-500">
            {transactions.length === 0 ? 'No transactions yet' : 'No results match your search'}
          </p>
          {transactions.length === 0 && (
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 text-xs text-sky-500 hover:text-sky-700 font-medium"
            >
              Add your first transaction
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filtered.map(tx => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        </div>
      )}

      {showModal && <AddTransactionModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
