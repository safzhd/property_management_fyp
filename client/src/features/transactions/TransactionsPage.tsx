import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Download, TrendingUp, TrendingDown, PoundSterling,
  Clock, Search, Trash2, ChevronDown, Paperclip, X,
  Building2, Tag, CalendarDays, CreditCard, User, FileText, StickyNote, ZoomIn
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/axios'
import { getTransactions, getTransactionSummary, deleteTransaction, getExportUrl } from '@/api/transactions'
import { getAllDocuments } from '@/api/documents'
import type { Document } from '@/api/documents'
import { AuthImage } from '@/components/AuthImage'
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

const PAID_STATUSES = new Set(['paid', 'reconciled', 'refunded'])

function isOverdue(tx: Transaction): boolean {
  if (PAID_STATUSES.has(tx.status)) return false
  const daysPast = (Date.now() - new Date(tx.date).getTime()) / 86400000
  return daysPast > 10
}

function isPaidLate(tx: Transaction): boolean {
  if (tx.status !== 'paid' && tx.status !== 'reconciled') return false
  return (new Date(tx.createdAt).getTime() - new Date(tx.date).getTime()) / 86400000 > 5
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer:  'Bank Transfer',
  standing_order: 'Standing Order',
  card:           'Card',
  cash:           'Cash',
  cheque:         'Cheque',
  other:          'Other',
}

function DetailRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />}
      <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-800 text-right flex-1">{value}</span>
    </div>
  )
}

function TransactionDetailModal({
  tx, receipt, onClose,
}: {
  tx: Transaction
  receipt?: Document
  onClose: () => void
}) {
  const isIncome = tx.type === 'income'
  const [lightbox, setLightbox] = useState(false)

  const isImage = receipt?.mimeType?.startsWith('image/')

  async function handleReceiptDownload() {
    if (!receipt) return
    try {
      const res = await api.get(`/documents/file/${receipt.id}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = receipt.fileName; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Failed to download receipt') }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              isIncome ? 'bg-emerald-50' : 'bg-red-50'
            )}>
              {isIncome
                ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                : <TrendingDown className="w-4 h-4 text-red-500" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {toTitleCase(tx.description || ALL_CATEGORY_LABELS[tx.category])}
              </p>
              <p className="text-xs text-gray-400">
                {ALL_CATEGORY_LABELS[tx.category]}
                {tx.tenant ? ` · ${tx.tenant}` : ''}
                {tx.property ? ` · ${tx.property}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
              isPaidLate(tx) ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' : STATUS_STYLES[tx.status]
            )}>
              {isPaidLate(tx) ? 'Paid Late' : tx.status === 'late' ? 'Overdue' : tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
            </span>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Amount banner */}
        <div className={cn(
          'px-5 py-4 text-center border-b border-gray-100',
          isIncome ? 'bg-emerald-50' : 'bg-red-50'
        )}>
          <p className={cn('text-2xl font-bold', isIncome ? 'text-emerald-700' : 'text-red-600')}>
            {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{formatDate(tx.date)}</p>
        </div>

        {/* Details */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <div className="bg-gray-50 rounded-xl px-4">
            <DetailRow label="Property"       value={tx.property}              icon={Building2} />
            <DetailRow label="Category"       value={ALL_CATEGORY_LABELS[tx.category]} icon={Tag} />
            <DetailRow label="Date"           value={formatDate(tx.date)}      icon={CalendarDays} />
            <DetailRow label="Status"         value={tx.status.charAt(0).toUpperCase() + tx.status.slice(1)} icon={FileText} />
            {tx.description && (
              <DetailRow label="Description"  value={tx.description}           icon={StickyNote} />
            )}
            {tx.supplier && (
              <DetailRow label="Supplier"     value={tx.supplier}              icon={User} />
            )}
            {tx.paymentMethod && (
              <DetailRow label="Payment"      value={PAYMENT_METHOD_LABELS[tx.paymentMethod] ?? tx.paymentMethod} icon={CreditCard} />
            )}
            {tx.reference && (
              <DetailRow label="Reference"    value={tx.reference}             icon={FileText} />
            )}
            {tx.notes && (
              <DetailRow label="Notes"        value={tx.notes}                 icon={StickyNote} />
            )}
            {receipt && (
              <div className="py-2.5">
                <div className="flex items-center gap-3 mb-2">
                  <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-500 w-28 shrink-0">Receipt</span>
                  <button
                    onClick={handleReceiptDownload}
                    className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-800 transition-colors ml-auto"
                  >
                    <Download className="w-3 h-3" /> Download
                  </button>
                </div>
                {isImage && (
                  <div
                    className="relative mt-1 rounded-lg overflow-hidden border border-gray-200 cursor-zoom-in group"
                    onClick={() => setLightbox(true)}
                  >
                    <AuthImage
                      docId={receipt.id}
                      alt={receipt.fileName}
                      className="w-full max-h-48 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                )}
                {!isImage && (
                  <p className="text-xs text-gray-400 ml-10 mt-1 truncate">{receipt.fileName}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && receipt && isImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <AuthImage
            docId={receipt.id}
            alt={receipt.fileName}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  )
}

function TransactionRow({
  tx,
  onDelete,
  receipt,
  onClick,
}: {
  tx: Transaction
  onDelete: (id: string) => void
  receipt?: Document
  onClick: () => void
}) {
  const isIncome = tx.type === 'income'
  const overdue  = isOverdue(tx)

  return (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors group cursor-pointer',
        overdue && 'bg-red-50/40'
      )}
      onClick={onClick}
    >
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
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800 truncate">
            {toTitleCase(tx.description || ALL_CATEGORY_LABELS[tx.category])}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-gray-400 truncate">
            {ALL_CATEGORY_LABELS[tx.category]}
            {tx.tenant ? ` · ${tx.tenant}` : ''}
            {tx.supplier ? ` · ${tx.supplier}` : ''}
            {tx.property ? ` · ${tx.property}` : ''}
          </p>
          {receipt && (
            <span className="inline-flex items-center gap-1 text-xs text-sky-500 shrink-0">
              <Paperclip className="w-3 h-3" />
              Receipt
            </span>
          )}
        </div>
      </div>

      {/* Date */}
      <p className="text-xs text-gray-400 shrink-0 hidden sm:block">{formatDate(tx.date)}</p>

      {/* Status */}
      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full shrink-0 hidden sm:inline-flex',
        isPaidLate(tx) ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' : STATUS_STYLES[tx.status]
      )}>
        {isPaidLate(tx) ? 'Paid Late' : tx.status === 'late' ? 'Overdue' : tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
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
        onClick={e => { e.stopPropagation(); onDelete(tx.id) }}
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

  const [showModal, setShowModal]       = useState(false)
  const [selectedTx, setSelectedTx]     = useState<Transaction | null>(null)
  const [typeFilter, setTypeFilter]     = useState('')
  const [search, setSearch]             = useState('')
  type Preset = 'this_year' | 'last_year' | 'last_2' | 'last_3' | 'custom' | number
  const [preset, setPreset]             = useState<Preset>('this_year')
  const [customFrom, setCustomFrom]     = useState(currentYear)
  const [customTo, setCustomTo]         = useState(currentYear)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef                     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const yearFrom = preset === 'this_year' ? currentYear
                 : preset === 'last_year' ? currentYear - 1
                 : preset === 'last_2'    ? currentYear - 1
                 : preset === 'last_3'    ? currentYear - 2
                 : preset === 'custom'    ? customFrom
                 : preset as number

  const yearTo   = preset === 'this_year' ? currentYear
                 : preset === 'last_year' ? currentYear - 1
                 : preset === 'last_2'    ? currentYear
                 : preset === 'last_3'    ? currentYear
                 : preset === 'custom'    ? customTo
                 : preset as number

  const presetLabel = preset === 'this_year' ? 'This Year'
                    : preset === 'last_year'  ? 'Last Year'
                    : preset === 'last_2'     ? 'Last 2 Years'
                    : preset === 'last_3'     ? 'Last 3 Years'
                    : preset === 'custom'     ? (customFrom === customTo ? `${customFrom}` : `${customFrom}–${customTo}`)
                    : `${preset}`

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', typeFilter, yearFrom, yearTo],
    queryFn:  () => getTransactions({
      type: typeFilter as TransactionType || undefined,
      yearFrom,
      yearTo,
    }),
  })

  const { data: summaryData } = useQuery({
    queryKey: ['transaction-summary', yearFrom, yearTo],
    queryFn:  () => getTransactionSummary({ yearFrom, yearTo }),
  })

  const { data: allDocs = [] } = useQuery({
    queryKey: ['documents'],
    queryFn:  () => getAllDocuments(),
  })

  // Map transaction_id → receipt/invoice document
  const receiptByTxId = new Map<string, Document>()
  for (const doc of allDocs) {
    if (doc.transactionId && (doc.documentType === 'receipt' || doc.documentType === 'invoice' || doc.documentType === 'other')) {
      if (!receiptByTxId.has(doc.transactionId)) {
        receiptByTxId.set(doc.transactionId, doc)
      }
    }
  }

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

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i)

  function handleExport() {
    const fileLabel = yearFrom === yearTo ? `${yearFrom}` : `${yearFrom}-${yearTo}`
    api.get(getExportUrl(yearFrom, yearTo), { responseType: 'blob' })
      .then(res => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(res.data)
        a.download = `transactions-${fileLabel}.csv`
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
            {isLoading ? 'Loading…' : `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} · ${presetLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period picker */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              className="flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors"
            >
              <span className="font-medium text-gray-700">{presetLabel}</span>
              <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', dropdownOpen && 'rotate-180')} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                {/* Named presets */}
                {([
                  { key: 'this_year', label: 'This Year' },
                  { key: 'last_year', label: 'Last Year' },
                  { key: 'last_2',    label: 'Last 2 Years' },
                  { key: 'last_3',    label: 'Last 3 Years' },
                ] as const).map(p => (
                  <button
                    key={p.key}
                    onClick={() => { setPreset(p.key); setDropdownOpen(false) }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      preset === p.key
                        ? 'bg-sky-50 text-sky-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {p.label}
                  </button>
                ))}

                {/* Divider */}
                <div className="my-1 border-t border-gray-100" />

                {/* Individual years */}
                {yearOptions.map(y => (
                  <button
                    key={y}
                    onClick={() => { setPreset(y); setDropdownOpen(false) }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      preset === y
                        ? 'bg-sky-50 text-sky-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {y}
                  </button>
                ))}

                {/* Divider */}
                <div className="my-1 border-t border-gray-100" />

                {/* Custom range */}
                <button
                  onClick={() => { setPreset('custom'); setCustomFrom(yearFrom); setCustomTo(yearTo) }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors',
                    preset === 'custom'
                      ? 'bg-sky-50 text-sky-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  Custom Range…
                </button>

                {/* Custom range inputs */}
                {preset === 'custom' && (
                  <div className="px-3 pb-3 pt-1 flex items-center gap-2">
                    <div className="relative flex-1">
                      <select
                        value={customFrom}
                        onChange={e => {
                          const y = Number(e.target.value)
                          setCustomFrom(y)
                          if (y > customTo) setCustomTo(y)
                        }}
                        className="w-full appearance-none pl-2 pr-6 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                      >
                        {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">to</span>
                    <div className="relative flex-1">
                      <select
                        value={customTo}
                        onChange={e => {
                          const y = Number(e.target.value)
                          setCustomTo(y)
                          if (y < customFrom) setCustomFrom(y)
                        }}
                        className="w-full appearance-none pl-2 pr-6 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                      >
                        {yearOptions.filter(y => y >= customFrom).map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>
            )}
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
          sub={presetLabel}
          icon={TrendingUp}
          colour="bg-emerald-50 text-emerald-600"
        />
        <SummaryCard
          label="Total Expenses"
          amount={summary?.total_expenses ?? 0}
          sub={presetLabel}
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
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">P&L By Property — {presetLabel}</h2>
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
                receipt={receiptByTxId.get(tx.id)}
                onClick={() => setSelectedTx(tx)}
              />
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <AddTransactionModal
          onClose={() => setShowModal(false)}
          onAdded={(tx) => {
            const txYear = new Date(tx.date).getFullYear()
            if (txYear !== yearFrom || txYear !== yearTo) {
              setPreset(txYear)
            }
          }}
        />
      )}

      {selectedTx && (
        <TransactionDetailModal
          tx={selectedTx}
          receipt={receiptByTxId.get(selectedTx.id)}
          onClose={() => setSelectedTx(null)}
        />
      )}
    </div>
  )
}
