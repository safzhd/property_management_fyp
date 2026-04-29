import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Home, MapPin, Calendar, PoundSterling, FileText,
  Upload, Download, Trash2, Shield, CheckCircle2,
  AlertCircle, Clock, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getTenancies } from '@/api/tenancies'
import { getTransactions } from '@/api/transactions'
import { getAllDocuments, uploadDocument, deleteDocument, getFileUrl } from '@/api/documents'
import type { DocumentType } from '@/api/documents'
import type { Transaction } from '@/types/transaction'
import type { RentFrequency } from '@/types/tenancy'

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CHIP: Record<string, string> = {
  pending:     'bg-yellow-100 text-yellow-700',
  onboarding:  'bg-blue-100 text-blue-700',
  active:      'bg-emerald-100 text-emerald-700',
  notice:      'bg-orange-100 text-orange-700',
  offboarding: 'bg-purple-100 text-purple-700',
  ended:       'bg-gray-100 text-gray-500',
  cancelled:   'bg-red-100 text-red-600',
}

const STATUS_LABEL: Record<string, string> = {
  pending:     'Draft',
  onboarding:  'Onboarding',
  active:      'Active',
  notice:      'Notice Served',
  offboarding: 'Offboarding',
  ended:       'Ended',
  cancelled:   'Cancelled',
}

const DOC_TYPE_LABELS: Partial<Record<DocumentType, string>> = {
  tenancy_agreement:  'Tenancy Agreement',
  how_to_rent_guide:  'How to Rent Guide',
  tenant_info_sheet:  'Tenant Info Sheet',
  deposit_protection: 'Deposit Protection',
  inventory:          'Inventory',
  id_document:        'ID Document',
  reference:          'Reference',
  other:              'Other',
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatDate(d: string | null | Date) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatShortDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(n)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Rent due date calculation ─────────────────────────────────────────────────

function computeNextDue(rentDueDay: number, frequency: RentFrequency): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (frequency === 'monthly') {
    let d = new Date(today.getFullYear(), today.getMonth(), rentDueDay)
    if (d <= today) d = new Date(today.getFullYear(), today.getMonth() + 1, rentDueDay)
    return d
  }
  // weekly / fortnightly — approximate from today
  const days = frequency === 'weekly' ? 7 : 14
  const d = new Date(today)
  d.setDate(d.getDate() + days)
  return d
}

function daysUntil(date: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((date.getTime() - today.getTime()) / 86400000)
}

// ── Rent status card ──────────────────────────────────────────────────────────

type RentCardStatus = 'paid' | 'due' | 'overdue' | 'upcoming'

function getRentStatus(transactions: Transaction[], rentDueDay: number, frequency: RentFrequency): {
  status: RentCardStatus
  currentTx: Transaction | null
  nextDue: Date
} {
  const nextDue = computeNextDue(rentDueDay, frequency)

  // Most recent rent transaction
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
  const latest = sorted[0] ?? null

  if (!latest) return { status: 'upcoming', currentTx: null, nextDue }

  if (latest.status === 'late') return { status: 'overdue', currentTx: latest, nextDue }
  if (latest.status === 'pending') {
    const d = daysUntil(new Date(latest.date))
    return { status: d < 0 ? 'overdue' : 'due', currentTx: latest, nextDue }
  }
  if (latest.status === 'paid' || latest.status === 'reconciled') {
    return { status: 'paid', currentTx: latest, nextDue }
  }

  return { status: 'upcoming', currentTx: null, nextDue }
}

function RentCard({
  rentAmount,
  rentFrequency,
  rentDueDay,
  transactions,
  onUpload,
  uploading,
}: {
  rentAmount: number
  rentFrequency: RentFrequency
  rentDueDay: number
  transactions: Transaction[]
  onUpload: () => void
  uploading: boolean
}) {
  const { status, currentTx, nextDue } = getRentStatus(transactions, rentDueDay, rentFrequency)
  const days = daysUntil(nextDue)

  const configs = {
    paid: {
      bg:      'bg-emerald-50 border-emerald-200',
      iconBg:  'bg-emerald-100',
      icon:    <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
      chip:    'bg-emerald-100 text-emerald-700',
      chipTxt: 'Paid',
      heading: 'Rent Paid',
      sub:     currentTx ? `Paid ${formatShortDate(currentTx.date)}` : 'Up to date',
      nextLine: `Next due ${formatShortDate(nextDue)}`,
    },
    due: {
      bg:      'bg-amber-50 border-amber-200',
      iconBg:  'bg-amber-100',
      icon:    <Clock className="w-5 h-5 text-amber-600" />,
      chip:    'bg-amber-100 text-amber-700',
      chipTxt: 'Due',
      heading: 'Rent Due',
      sub:     currentTx
        ? `Due ${formatShortDate(currentTx.date)}`
        : `Due ${formatShortDate(nextDue)}`,
      nextLine: days === 0 ? 'Due today' : `Due in ${days} day${days !== 1 ? 's' : ''}`,
    },
    overdue: {
      bg:      'bg-red-50 border-red-200',
      iconBg:  'bg-red-100',
      icon:    <AlertCircle className="w-5 h-5 text-red-600" />,
      chip:    'bg-red-100 text-red-700',
      chipTxt: 'Overdue',
      heading: 'Rent Overdue',
      sub:     currentTx
        ? `Was due ${formatShortDate(currentTx.date)}`
        : 'Payment not received',
      nextLine: `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`,
    },
    upcoming: {
      bg:      'bg-sky-50 border-sky-200',
      iconBg:  'bg-sky-100',
      icon:    <PoundSterling className="w-5 h-5 text-sky-600" />,
      chip:    'bg-sky-100 text-sky-700',
      chipTxt: 'Upcoming',
      heading: 'Next Rent Payment',
      sub:     `Due ${formatShortDate(nextDue)}`,
      nextLine: days === 0 ? 'Due today' : `Due in ${days} day${days !== 1 ? 's' : ''}`,
    },
  }

  const c = configs[status]
  const showCTA = status === 'due' || status === 'overdue' || status === 'upcoming'

  return (
    <div className={cn('rounded-xl border p-5', c.bg)}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', c.iconBg)}>
            {c.icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">{c.heading}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.sub}</p>
          </div>
        </div>
        <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full shrink-0', c.chip)}>
          {c.chipTxt}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(rentAmount)}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            per {rentFrequency === 'fortnightly' ? 'fortnight' : rentFrequency.replace('ly', '')}
            {' · '}<span className={cn('font-medium', status === 'overdue' ? 'text-red-600' : 'text-gray-600')}>{c.nextLine}</span>
          </p>
        </div>

        {showCTA && (
          <button
            onClick={onUpload}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-gray-200 shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Upload Proof'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Payment history ───────────────────────────────────────────────────────────

const TX_STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  paid:       { label: 'Paid',       cls: 'bg-emerald-100 text-emerald-700' },
  reconciled: { label: 'Paid',       cls: 'bg-emerald-100 text-emerald-700' },
  pending:    { label: 'Pending',    cls: 'bg-amber-100 text-amber-700' },
  late:       { label: 'Overdue',    cls: 'bg-red-100 text-red-600' },
  partial:    { label: 'Partial',    cls: 'bg-blue-100 text-blue-700' },
  failed:     { label: 'Failed',     cls: 'bg-red-100 text-red-600' },
  refunded:   { label: 'Refunded',   cls: 'bg-purple-100 text-purple-700' },
}

function isPaidLate(tx: Transaction): boolean {
  if (tx.status !== 'paid' && tx.status !== 'reconciled') return false
  return (new Date(tx.createdAt).getTime() - new Date(tx.date).getTime()) / 86400000 > 5
}

function PaymentHistory({ transactions }: { transactions: Transaction[] }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
  const shown = expanded ? sorted : sorted.slice(0, 4)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          Payment History
          <span className="ml-2 text-xs font-normal text-gray-400">{sorted.length} payment{sorted.length !== 1 ? 's' : ''}</span>
        </h2>
      </div>

      {sorted.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-400">No payment records yet.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100">
            {shown.map(tx => {
              const chip = isPaidLate(tx)
                ? { label: 'Paid Late', cls: 'bg-yellow-100 text-yellow-700' }
                : TX_STATUS_CHIP[tx.status] ?? { label: tx.status, cls: 'bg-gray-100 text-gray-600' }
              return (
                <div key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      tx.status === 'paid' || tx.status === 'reconciled' ? 'bg-emerald-50' : 'bg-gray-100'
                    )}>
                      <PoundSterling className={cn(
                        'w-3.5 h-3.5',
                        tx.status === 'paid' || tx.status === 'reconciled' ? 'text-emerald-600' : 'text-gray-400'
                      )} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Rent Payment</p>
                      <p className="text-xs text-gray-400">{formatShortDate(tx.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', chip.cls)}>
                      {chip.label}
                    </span>
                    <p className="text-sm font-bold text-gray-800 w-16 text-right">
                      {formatCurrency(tx.amount)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {sorted.length > 4 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full flex items-center justify-center gap-1.5 px-5 py-3 text-xs font-medium text-gray-500 hover:bg-gray-50 border-t border-gray-100 transition-colors"
            >
              {expanded ? (
                <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5" /> Show {sorted.length - 4} more</>
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyTenancyPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const { data: tenancies = [], isLoading } = useQuery({
    queryKey: ['my-tenancy'],
    queryFn: () => getTenancies(),
  })

  const tenancy = tenancies[0] ?? null

  const { data: rentTransactions = [] } = useQuery({
    queryKey: ['my-rent-transactions', tenancy?.id],
    queryFn: () => getTransactions({ tenancyId: tenancy!.id }),
    enabled: !!tenancy,
  })

  const { data: allDocs = [] } = useQuery({
    queryKey: ['documents', tenancy?.id],
    queryFn: () => tenancy ? getAllDocuments({ tenancyId: tenancy.id }) : Promise.resolve([]),
    enabled: !!tenancy,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Document removed')
    },
  })

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !tenancy) return
    setUploading(true)
    try {
      await uploadDocument(
        undefined,
        file,
        'other',
        'Payment Proof',
        undefined,
        tenancy.id
      )
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Payment proof uploaded')
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDownload(docId: string, fileName: string) {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(getFileUrl(docId), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download file')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  if (!tenancy) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed border-gray-200 bg-white">
        <Home className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm font-medium text-gray-500">No tenancy found</p>
      </div>
    )
  }

  const propertyDisplay = tenancy.property.name || tenancy.property.address

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Tenancy</h1>
        <p className="text-sm text-gray-500 mt-0.5">{propertyDisplay}{tenancy.roomName ? ` · ${tenancy.roomName}` : ''}</p>
      </div>

      {/* Rent status card */}
      <RentCard
        rentAmount={tenancy.rentAmount}
        rentFrequency={tenancy.rentFrequency}
        rentDueDay={tenancy.rentDueDay}
        transactions={rentTransactions}
        onUpload={() => fileRef.current?.click()}
        uploading={uploading}
      />
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />

      {/* Payment history */}
      <PaymentHistory transactions={rentTransactions} />

      {/* Tenancy details */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Tenancy Details</h2>
          <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', STATUS_CHIP[tenancy.lifecycleStatus])}>
            {STATUS_LABEL[tenancy.lifecycleStatus]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Address</p>
              <p className="text-sm font-medium text-gray-800">{tenancy.property.address}</p>
              <p className="text-sm text-gray-500">{tenancy.property.postcode}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Start Date</p>
              <p className="text-sm font-medium text-gray-800">{formatDate(tenancy.startDate)}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">End Date</p>
              <p className="text-sm font-medium text-gray-800">
                {tenancy.endDate ? formatDate(tenancy.endDate) : 'Periodic (no fixed end)'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Tenancy Type</p>
              <p className="text-sm font-medium text-gray-800 capitalize">
                {tenancy.tenancyType.replace('_', ' ')}
              </p>
            </div>
          </div>

          {tenancy.depositAmount && (
            <div className="flex items-start gap-2.5 col-span-2">
              <Shield className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Deposit</p>
                <p className="text-sm font-medium text-gray-800">{formatCurrency(tenancy.depositAmount)}</p>
                {tenancy.depositScheme && (
                  <p className="text-xs text-gray-400">{tenancy.depositScheme}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Documents */}
      {allDocs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Documents
            <span className="ml-2 text-xs text-gray-400 font-normal">{allDocs.length} file{allDocs.length !== 1 ? 's' : ''}</span>
          </h2>
          <div className="space-y-2">
            {allDocs.map(doc => (
              <div key={doc.id} className="group flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                    <p className="text-xs text-gray-400">
                      {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                      {doc.description ? ` · ${doc.description}` : ''}
                      {' · '}{formatBytes(doc.fileSize)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDownload(doc.id, doc.fileName)}
                    className="p-1.5 rounded text-gray-400 hover:text-sky-600 hover:bg-sky-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(doc.id)}
                    className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
