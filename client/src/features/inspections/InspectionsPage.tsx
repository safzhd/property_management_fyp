import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Flame, Users, Sparkles, Leaf, Home, ShieldCheck,
  CheckCircle2, AlertCircle, AlertTriangle, Plus, X,
  ChevronDown, ChevronUp, Camera, ClipboardList, CalendarCheck,
  Trash2, Clock, BellRing,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getProperties } from '@/api/properties'
import { useAuthStore } from '@/store/authStore'
import {
  getInspectionStatus, getInspections, getInspection, createInspection, uploadInspectionPhotos, deleteInspection,
  TYPE_LABELS, FREQ_LABELS, CHECKLISTS, getTypesForProperty,
} from '@/api/inspections'
import type { InspectionType, InspectionResult, ItemResult, Inspection, InspectionDetail } from '@/api/inspections'

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE_ICON: Record<InspectionType, React.ElementType> = {
  fire_alarm:         Flame,
  communal_area:      Users,
  cleaning:           Sparkles,
  garden_exterior:    Leaf,
  full_property:      Home,
  hmo_compliance:     ShieldCheck,
  fire_co_alarm:      BellRing,
  property_condition: ClipboardList,
}

const TYPE_ICON_COLOR: Record<InspectionType, string> = {
  fire_alarm:         'text-red-500',
  communal_area:      'text-blue-500',
  cleaning:           'text-purple-500',
  garden_exterior:    'text-green-600',
  full_property:      'text-indigo-500',
  hmo_compliance:     'text-amber-600',
  fire_co_alarm:      'text-orange-500',
  property_condition: 'text-sky-500',
}

const RESULT_STYLE: Record<InspectionResult, string> = {
  pass:          'bg-green-100 text-green-700',
  issues_noted:  'bg-amber-100 text-amber-700',
  fail:          'bg-red-100 text-red-700',
}

const RESULT_LABEL: Record<InspectionResult, string> = {
  pass:         'Pass',
  issues_noted: 'Issues Noted',
  fail:         'Fail',
}

const STATUS_ICON = {
  ok:      <CheckCircle2 className="w-4 h-4 text-green-500" />,
  due:     <AlertTriangle className="w-4 h-4 text-amber-500" />,
  overdue: <AlertCircle   className="w-4 h-4 text-red-500" />,
}

const STATUS_BG = {
  ok:      'bg-green-50  border-green-200',
  due:     'bg-amber-50  border-amber-200',
  overdue: 'bg-red-50    border-red-200',
}

const STATUS_LABEL = { ok: 'Up to Date', due: 'Due Soon', overdue: 'Overdue' }

// Fetches an auth-protected image via the proxied relative URL and renders as blob
function AuthedImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const token = useAuthStore(s => s.accessToken)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    // Use relative URL so requests go through Vite proxy (avoids CORS)
    const url = src.startsWith('http') ? new URL(src).pathname : src
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(b => {
        if (!active) return
        objectUrl = URL.createObjectURL(b)
        setBlobUrl(objectUrl)
      })
      .catch(() => {})
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, token])

  if (!blobUrl) return <div className={cn('bg-gray-100 animate-pulse rounded-lg', className)} />
  return <img src={blobUrl} alt={alt} className={className} />
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Status Card ───────────────────────────────────────────────────────────────

function StatusCard({
  type, status, lastDate, nextDue, onClick,
}: {
  type: InspectionType
  status: 'ok' | 'due' | 'overdue'
  lastDate: string | null
  nextDue: string | null
  onClick: () => void
}) {
  const Icon = TYPE_ICON[type]
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-2 p-4 rounded-xl border text-left w-full transition-opacity hover:opacity-90',
        STATUS_BG[status]
      )}
    >
      <div className="flex items-center justify-between w-full">
        <Icon className={cn('w-5 h-5', TYPE_ICON_COLOR[type])} />
        {STATUS_ICON[status]}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800 leading-snug">{TYPE_LABELS[type]}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{FREQ_LABELS[type]}</p>
      </div>
      <div className="text-[11px] text-gray-500 space-y-0.5 w-full">
        <p>{lastDate ? `Last: ${formatDate(lastDate)}` : 'Never inspected'}</p>
        {nextDue && <p className={cn('font-medium', status === 'overdue' ? 'text-red-600' : status === 'due' ? 'text-amber-600' : 'text-green-600')}>
          {status === 'overdue' ? 'Was due: ' : 'Next: '}{formatDate(nextDue)}
        </p>}
      </div>
      <span className={cn(
        'text-[10px] font-semibold px-2 py-0.5 rounded-full',
        status === 'ok' ? 'bg-green-200 text-green-800' : status === 'due' ? 'bg-amber-200 text-amber-800' : 'bg-red-200 text-red-800'
      )}>
        {STATUS_LABEL[status]}
      </span>
    </button>
  )
}

// ── Inspection Row ────────────────────────────────────────────────────────────

function InspectionRow({
  insp, onView, onDelete,
}: {
  insp: Inspection
  onView: () => void
  onDelete: () => void
}) {
  const Icon = TYPE_ICON[insp.type]
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gray-100')}>
        <Icon className={cn('w-4 h-4', TYPE_ICON_COLOR[insp.type])} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">{TYPE_LABELS[insp.type]}</span>
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', RESULT_STYLE[insp.overallResult])}>
            {RESULT_LABEL[insp.overallResult]}
          </span>
          {(insp.failCount ?? 0) > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
              {insp.failCount} issue{insp.failCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {formatDate(insp.inspectionDate)} · {insp.inspectorName}
          {insp.propertyName && <span> · {insp.propertyName}</span>}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onView}  className="px-2.5 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">View</button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => getInspection(id),
  })
  const insp: InspectionDetail | undefined = data?.inspection

  const RESULT_DOT: Record<ItemResult, string> = {
    pass: 'bg-green-500',
    fail: 'bg-red-500',
  }
  const RESULT_ITEM_LABEL: Record<ItemResult, string> = { pass: 'Pass', fail: 'Fail' }

  return (
    <ModalShell onClose={onClose} title="Inspection Detail">
      {isLoading || !insp ? (
        <div className="space-y-3 p-5">{[1,2,3].map(i => <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />)}</div>
      ) : (
        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Type</p>
              <p className="font-medium flex items-center gap-1.5 mt-0.5">
                {(() => { const Icon = TYPE_ICON[insp.type]; return <Icon className={cn('w-4 h-4', TYPE_ICON_COLOR[insp.type])} /> })()}
                {TYPE_LABELS[insp.type]}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Result</p>
              <span className={cn('inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5', RESULT_STYLE[insp.overallResult])}>
                {RESULT_LABEL[insp.overallResult]}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500">Date</p>
              <p className="font-medium mt-0.5">{formatDate(insp.inspectionDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Inspector</p>
              <p className="font-medium mt-0.5">{insp.inspectorName}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-500">Property</p>
              <p className="font-medium mt-0.5">{insp.propertyName}</p>
            </div>
            {insp.notes && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500">Notes</p>
                <p className="mt-0.5 text-gray-700">{insp.notes}</p>
              </div>
            )}
          </div>

          {/* Checklist */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Checklist</h3>
            <div className="space-y-2">
              {insp.items.map(item => (
                <div key={item.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-50">
                  <span className={cn('mt-1 w-2 h-2 rounded-full shrink-0', RESULT_DOT[item.result])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{item.itemLabel}</p>
                    {item.notes && <p className="text-xs text-gray-500 mt-0.5">{item.notes}</p>}
                  </div>
                  <span className="text-[10px] font-semibold text-gray-500 shrink-0">{RESULT_ITEM_LABEL[item.result]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Photos */}
          {insp.photos.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos</h3>
              <div className="grid grid-cols-3 gap-2">
                {insp.photos.map(photo => (
                  <AuthedImg
                    key={photo.id}
                    src={`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}${photo.url}`}
                    alt={photo.fileName}
                    className="w-full h-24 object-cover rounded-lg border border-gray-200"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  )
}

// ── Log Inspection Modal ──────────────────────────────────────────────────────

function LogModal({
  onClose,
  defaultType,
  defaultPropertyId,
  properties,
}: {
  onClose: () => void
  defaultType?: InspectionType
  defaultPropertyId?: string
  properties: { id: string; name: string; isHmo: boolean }[]
}) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)

  const [propertyId, setPropertyId]       = useState(defaultPropertyId ?? '')
  const date = new Date().toISOString().split('T')[0]
  const [overallResult, setOverallResult] = useState<InspectionResult | null>(null)
  const [notes, setNotes]                 = useState('')
  const [photos, setPhotos]               = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Derive available types from selected property
  const selectedProp = properties.find(p => p.id === propertyId)
  const availableTypes = selectedProp ? getTypesForProperty(selectedProp.isHmo) : getTypesForProperty(true)

  const defaultT = defaultType && availableTypes.includes(defaultType) ? defaultType : undefined
  const [type, setType] = useState<InspectionType | ''>(defaultT ?? '')

  // Inspector name auto-filled from logged-in user (read-only)
  const inspectorName = user ? `${user.givenName} ${user.lastName}` : ''

  // Items default to unselected (null = not yet answered)
  const [items, setItems] = useState<{ itemLabel: string; result: ItemResult | null; notes: string }[]>(() =>
    defaultT ? CHECKLISTS[defaultT].map(label => ({ itemLabel: label, result: null, notes: '' })) : []
  )

  // Reset checklist when type changes
  useEffect(() => {
    if (!type) { setItems([]); return }
    setItems(CHECKLISTS[type].map(label => ({ itemLabel: label, result: null, notes: '' })))
  }, [type])

  // When property changes, reset type if current type not valid for new property
  useEffect(() => {
    if (!propertyId) return
    const prop = properties.find(p => p.id === propertyId)
    const types = prop ? getTypesForProperty(prop.isHmo) : availableTypes
    if (type && !types.includes(type as InspectionType)) setType('')
  }, [propertyId])

  const allAnswered = items.length > 0 && items.every(i => i.result !== null)

  // Auto-derive overall result once all items are answered
  useEffect(() => {
    if (!allAnswered) { setOverallResult(null); return }
    if (items.some(i => i.result === 'fail')) setOverallResult('fail')
    else setOverallResult('pass')
  }, [items, allAnswered])

  const mutation = useMutation({
    mutationFn: async () => {
      const { inspectionId } = await createInspection({
        propertyId, type: type as InspectionType, inspectorName, inspectionDate: date,
        overallResult: overallResult!,
        notes: notes || undefined,
        items: items.map(i => ({ itemLabel: i.itemLabel, result: i.result as ItemResult, notes: i.notes || undefined })),
      })
      if (photos.length > 0) await uploadInspectionPhotos(inspectionId, photos)
      return inspectionId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspections'] })
      qc.invalidateQueries({ queryKey: ['inspections-status'] })
      qc.refetchQueries({ queryKey: ['inspections-status'] })
      toast.success('Inspection logged')
      onClose()
    },
    onError: () => toast.error('Failed to log inspection'),
  })

  function setItemResult(idx: number, result: ItemResult) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, result } : it))
  }

  function setItemNotes(idx: number, notes: string) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, notes } : it))
  }

  const canSubmit = Boolean(propertyId && type && inspectorName.trim() && date && allAnswered && overallResult && photos.length > 0)

  return (
    <ModalShell onClose={onClose} title="Log Inspection">
      <div className="overflow-y-auto max-h-[75vh]">
        <div className="p-5 space-y-5">

          {/* Property + Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Property *</label>
              <select
                value={propertyId}
                onChange={e => setPropertyId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="">Select a property…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Inspection Type *</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as InspectionType | '')}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="">Select a type…</option>
                {availableTypes.map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date + Inspector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date</label>
              <div className="w-full px-3 py-2.5 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-700">
                {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Inspector</label>
              <div className="w-full px-3 py-2.5 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-700">
                {inspectorName}
              </div>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Checklist</label>
              <span className="text-[10px] text-gray-400">
                {items.filter(i => i.result !== null).length}/{items.length} answered
              </span>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className={cn('rounded-lg border overflow-hidden', item.result === null ? 'border-gray-200' : item.result === 'pass' ? 'border-green-200' : 'border-red-200')}>
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className="flex-1 text-sm text-gray-800">{item.itemLabel}</span>
                    <div className="flex gap-1.5 shrink-0">
                      {(['pass', 'fail'] as ItemResult[]).map(r => (
                        <button
                          key={r}
                          onClick={() => setItemResult(idx, r)}
                          className={cn(
                            'px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors',
                            item.result === r
                              ? r === 'pass' ? 'bg-green-500 text-white'
                                : 'bg-red-500 text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          )}
                        >
                          {r === 'pass' ? 'Pass' : 'Fail'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {item.result === 'fail' && (
                    <div className="px-3 pb-3">
                      <input
                        type="text"
                        placeholder="Describe the issue…"
                        value={item.notes}
                        onChange={e => setItemNotes(idx, e.target.value)}
                        className="w-full px-2.5 py-2 text-xs border border-red-200 rounded-md focus:outline-none focus:ring-2 focus:ring-red-300 bg-red-50 placeholder:text-red-300"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Overall result override */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Overall Result</label>
            <div className="flex gap-2">
              {(['pass', 'issues_noted', 'fail'] as InspectionResult[]).map(r => (
                <button
                  key={r}
                  onClick={() => setOverallResult(r)}
                  className={cn(
                    'flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors',
                    overallResult === r
                      ? r === 'pass' ? 'bg-green-500 border-green-500 text-white'
                        : r === 'fail' ? 'bg-red-500 border-red-500 text-white'
                        : 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  )}
                >
                  {RESULT_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes</label>
            <textarea
              rows={3}
              placeholder="Any additional observations…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-gray-400 resize-none"
            />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Photos *</label>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={e => {
                const newFiles = Array.from(e.target.files ?? [])
                setPhotos(prev => [...prev, ...newFiles])
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-3 w-full rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-sky-300 hover:text-sky-600 transition-colors"
            >
              <Camera className="w-4 h-4" />
              {photos.length > 0 ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} selected` : 'Take or select photos'}
            </button>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {photos.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    <button
                      onClick={() => setPhotos(prev => prev.filter((_, pi) => pi !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Saving…' : 'Log Inspection'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Modal Shell ───────────────────────────────────────────────────────────────

function ModalShell({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InspectionsPage() {
  const qc = useQueryClient()
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [logType, setLogType] = useState<InspectionType | undefined>()
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<InspectionType | ''>('')
  const [showChecklist, setShowChecklist] = useState(false)

  const { data: propertiesData } = useQuery({ queryKey: ['properties'], queryFn: () => getProperties() })
  const { data: statusData, isLoading: loadingStatus } = useQuery({
    queryKey: ['inspections-status'],
    queryFn: getInspectionStatus,
  })
  const { data: inspData, isLoading: loadingInsp } = useQuery({
    queryKey: ['inspections', selectedPropertyId, typeFilter],
    queryFn: () => getInspections({
      ...(selectedPropertyId ? { propertyId: selectedPropertyId } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
    }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteInspection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspections'] })
      qc.invalidateQueries({ queryKey: ['inspections-status'] })
      toast.success('Inspection deleted')
    },
  })

  // getProperties() returns Property[] directly — used only for LogModal dropdown
  const allProperties: any[] = Array.isArray(propertiesData) ? propertiesData : []
  const propertyList = allProperties.map((p: any) => ({
    id:    p.id,
    name:  p.propertyName || p.addressLine1 || p.address || p.id,
    isHmo: Boolean(p.isHmo) || p.propertyType === 'hmo',
  }))

  // isHmo comes from statusData (backend already computes it) — single source of truth
  const selectedStatusProp = statusData?.properties.find(p => p.propertyId === selectedPropertyId)
  const selectedIsHmo = selectedStatusProp?.isHmo ?? true
  const relevantTypes = getTypesForProperty(selectedIsHmo)

  const selectedStatus = selectedStatusProp
  const inspections = inspData?.inspections ?? []

  // Counts — per-property when a property is selected, across all properties otherwise
  const allStatuses = statusData?.properties.flatMap(p =>
    getTypesForProperty(p.isHmo).map(t => p.types[t]?.status ?? 'overdue')
  ) ?? []
  const overdue = selectedStatus
    ? relevantTypes.filter(t => selectedStatus.types[t]?.status === 'overdue').length
    : allStatuses.filter(s => s === 'overdue').length
  const due = selectedStatus
    ? relevantTypes.filter(t => selectedStatus.types[t]?.status === 'due').length
    : allStatuses.filter(s => s === 'due').length
  const ok = selectedStatus
    ? relevantTypes.filter(t => selectedStatus.types[t]?.status === 'ok').length
    : allStatuses.filter(s => s === 'ok').length

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inspections</h1>
          {statusData && (
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
              {overdue > 0 && <span className="text-red-600 font-medium">{overdue} overdue</span>}
              {due > 0     && <span className="text-amber-600 font-medium">{due} due soon</span>}
              {ok > 0      && <span className="text-green-600">{ok} up to date</span>}
            </p>
          )}
        </div>
        <button
          onClick={() => { setLogType(undefined); setShowLog(true) }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Log Inspection
        </button>
      </div>

      {/* Property tabs */}
      {statusData && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedPropertyId(null)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              selectedPropertyId === null
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            )}
          >
            All Properties
          </button>
          {statusData.properties.map(p => {
            const relevant = getTypesForProperty(p.isHmo).map(t => p.types[t]).filter(Boolean)
            const hasIssue = relevant.some(t => t.status === 'overdue' || t.status === 'due')
            const allOk    = relevant.length > 0 && relevant.every(t => t.status === 'ok')
            return (
              <button
                key={p.propertyId}
                onClick={() => setSelectedPropertyId(p.propertyId)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5',
                  selectedPropertyId === p.propertyId
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', allOk ? 'bg-green-500' : hasIssue ? 'bg-red-500' : 'bg-amber-400')} />
                {p.propertyName}
              </button>
            )
          })}
        </div>
      )}

      {/* Compliance status grid — only shown when a specific property is selected */}
      <section className={cn(selectedPropertyId === null && 'hidden')}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Compliance Status</h2>
          <button onClick={() => setShowChecklist(v => !v)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
            <CalendarCheck className="w-3.5 h-3.5" />
            Schedule
            {showChecklist ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {showChecklist && (
          <div className="mb-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700 mb-1.5">
              {selectedIsHmo
                ? 'UK HMO Inspection Schedule (Housing Act 2004 / Fire Safety Order 2005)'
                : 'UK Single-Let Inspection Schedule'}
            </p>
            {relevantTypes.map(t => (
              <div key={t} className="flex items-center gap-2">
                {(() => { const Icon = TYPE_ICON[t]; return <Icon className={cn('w-3.5 h-3.5', TYPE_ICON_COLOR[t])} /> })()}
                <span className="font-medium">{TYPE_LABELS[t]}</span>
                <span className="text-gray-400">—</span>
                <span>{FREQ_LABELS[t]}</span>
              </div>
            ))}
          </div>
        )}

        {loadingStatus ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-36 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : selectedStatus ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {relevantTypes.map(type => {
              const ts = selectedStatus.types[type] ?? { status: 'overdue' as const, lastDate: null, nextDue: null }
              // Find the most recent inspection of this type for the selected property
              const existing = inspections.find(i => i.type === type && i.propertyId === selectedPropertyId)
              return (
                <StatusCard
                  key={type}
                  type={type}
                  status={ts.status}
                  lastDate={ts.lastDate}
                  nextDue={ts.nextDue}
                  onClick={() => existing ? setViewingId(existing.id) : (setLogType(type), setShowLog(true))}
                />
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 rounded-xl border border-dashed border-gray-200 bg-white">
            <ClipboardList className="w-7 h-7 text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-500">No properties found</p>
          </div>
        )}
      </section>

      {/* Inspection log */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Inspection Log</h2>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as InspectionType | '')}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-400 bg-white text-gray-600"
          >
            <option value="">All Types</option>
            {relevantTypes.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loadingInsp ? (
            <div className="p-4 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />)}
            </div>
          ) : inspections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32">
              <Clock className="w-7 h-7 text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-500">No inspections logged yet</p>
              <p className="text-xs text-gray-400 mt-0.5">Click a status card above to log one</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {inspections.map(insp => (
                <InspectionRow
                  key={insp.id}
                  insp={insp}
                  onView={() => setViewingId(insp.id)}
                  onDelete={() => {
                    if (confirm('Delete this inspection?')) deleteMutation.mutate(insp.id)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {showLog && (
        <LogModal
          onClose={() => setShowLog(false)}
          defaultType={logType}
          defaultPropertyId={selectedPropertyId ?? undefined}
          properties={propertyList}
        />
      )}
      {viewingId && <DetailModal id={viewingId} onClose={() => setViewingId(null)} />}
    </div>
  )
}
