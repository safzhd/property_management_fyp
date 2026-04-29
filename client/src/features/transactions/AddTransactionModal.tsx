import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, TrendingUp, TrendingDown, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createTransaction } from '@/api/transactions'
import { getProperties } from '@/api/properties'
import { uploadDocument } from '@/api/documents'
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/types/transaction'
import type { TransactionType, CreateTransactionPayload } from '@/types/transaction'
import { toast } from 'sonner'

interface Props {
  onClose: () => void
  defaultPropertyId?: string
  onAdded?: (tx: { id: string; date: string }) => void
}

const PAYMENT_METHODS = [
  { value: 'bank_transfer',  label: 'Bank Transfer' },
  { value: 'standing_order', label: 'Standing Order' },
  { value: 'card',           label: 'Card' },
  { value: 'cash',           label: 'Cash' },
  { value: 'cheque',         label: 'Cheque' },
  { value: 'other',          label: 'Other' },
]

const STATUS_OPTIONS = [
  { value: 'paid',    label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'failed',  label: 'Failed' },
]

const today = new Date().toISOString().split('T')[0]

export default function AddTransactionModal({ onClose, defaultPropertyId, onAdded }: Props) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<TransactionType>('income')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    propertyId:    defaultPropertyId ?? '',
    category:      '',
    amount:        '',
    date:          today,
    description:   '',
    supplier:      '',
    reference:     '',
    paymentMethod: '',
    status:        'paid',
    notes:         '',
  })

  const { data: properties = [] } = useQuery({
    queryKey: ['properties'],
    queryFn:  () => getProperties(),
  })

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const DESCRIPTION_PLACEHOLDER: Record<string, string> = {
    rent:                        'e.g. March rent payment',
    deposit:                     'e.g. Security deposit received',
    other_income:                'e.g. Parking fee, storage payment',
    council_tax:                 'e.g. Council tax — April',
    utility_gas:                 'e.g. Monthly gas bill',
    utility_electricity:         'e.g. Monthly electricity bill',
    utility_water:               'e.g. Water rates — Q1',
    utility_internet:            'e.g. Broadband bill',
    insurance:                   'e.g. Buildings & contents insurance',
    repairs_maintenance:         'e.g. Boiler repair, plumber call-out',
    letting_agent_fees:          'e.g. Monthly management fee',
    mortgage_interest:           'e.g. Monthly mortgage payment',
    ground_rent_service_charge:  'e.g. Annual ground rent',
    professional_fees:           'e.g. Accountant, solicitor fees',
    travel:                      'e.g. Travel to inspect property',
    other_expense:               'e.g. Miscellaneous expense',
  }

  const descriptionPlaceholder = form.category
    ? (DESCRIPTION_PLACEHOLDER[form.category] ?? 'Add a short description')
    : type === 'income' ? 'e.g. March rent payment' : 'e.g. Boiler repair'

  const mutation = useMutation({
    mutationFn: (payload: CreateTransactionPayload) => createTransaction(payload),
    onSuccess: async (tx) => {
      // Upload receipt if attached
      if (receiptFile) {
        try {
          await uploadDocument(
            form.propertyId || undefined,
            receiptFile,
            type === 'income' ? 'receipt' : 'invoice',
            `Receipt for transaction${form.reference ? ` ${form.reference}` : ''}`,
            undefined,
            undefined,
            tx.id
          )
          queryClient.invalidateQueries({ queryKey: ['documents'] })
        } catch {
          toast.warning('Transaction saved but receipt upload failed')
        }
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transaction-summary'] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Transaction added')
      onAdded?.(tx)
      onClose()
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to add transaction')
    },
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleTypeChange(t: TransactionType) {
    setType(t)
    setForm(f => ({ ...f, category: '' }))
  }

  const canSubmit = form.propertyId && form.category && form.amount && parseFloat(form.amount) > 0 && form.date

  function handleSubmit() {
    if (!canSubmit) return
    mutation.mutate({
      propertyId:    form.propertyId,
      type,
      category:      form.category as any,
      amount:        parseFloat(form.amount),
      date:          form.date,
      description:   form.description || undefined,
      supplier:      form.supplier || undefined,
      reference:     form.reference || undefined,
      paymentMethod: form.paymentMethod as any || undefined,
      status:        form.status as any,
      notes:         form.notes || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Add Transaction</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Income / Expense toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(['income', 'expense'] as TransactionType[]).map(t => (
              <button
                key={t}
                onClick={() => handleTypeChange(t)}
                className={cn(
                  'flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                  type === t
                    ? t === 'income'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-red-50 border-red-300 text-red-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                )}
              >
                {t === 'income'
                  ? <TrendingUp className="w-4 h-4" />
                  : <TrendingDown className="w-4 h-4" />}
                {t === 'income' ? 'Income' : 'Expense'}
              </button>
            ))}
          </div>

          {/* Property */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Property <span className="text-red-400">*</span></label>
            <select
              value={form.propertyId}
              onChange={e => set('propertyId', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
            >
              <option value="">— Select Property —</option>
              {properties.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.propertyName || p.addressLine1}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category <span className="text-red-400">*</span></label>
            <select
              value={form.category}
              onChange={e => set('category', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
            >
              <option value="">— Select Category —</option>
              {categories.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount (£) <span className="text-red-400">*</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder={descriptionPlaceholder}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </div>

          {/* Supplier (expenses only) */}
          {type === 'expense' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier / Payee</label>
              <input
                type="text"
                value={form.supplier}
                onChange={e => set('supplier', e.target.value)}
                placeholder="e.g. British Gas, Council, Contractor"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
          )}

          {/* Payment method + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
              <select
                value={form.paymentMethod}
                onChange={e => set('paymentMethod', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
              >
                <option value="">— Select —</option>
                {PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status <span className="text-red-400">*</span></label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reference / Invoice No.</label>
            <input
              type="text"
              value={form.reference}
              onChange={e => set('reference', e.target.value)}
              placeholder="e.g. INV-0042"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </div>

          {/* Receipt / proof attachment (optional) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Receipt / Proof (Optional)
            </label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors text-left',
                receiptFile
                  ? 'border-sky-300 bg-sky-50 text-sky-700'
                  : 'border-gray-200 text-gray-400 hover:border-gray-300'
              )}
            >
              <Paperclip className="w-3.5 h-3.5 shrink-0" />
              {receiptFile ? receiptFile.name : 'Attach image or PDF'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || mutation.isPending}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-semibold transition-colors',
              type === 'income'
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50'
                : 'bg-red-500 hover:bg-red-600 text-white disabled:opacity-50'
            )}
          >
            {mutation.isPending ? 'Saving…' : 'Add Transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}
