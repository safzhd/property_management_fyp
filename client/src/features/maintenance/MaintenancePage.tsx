import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Wrench, Plus, X, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/axios'
import { getTenancies } from '@/api/tenancies'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MaintenanceRequest {
  id: string
  propertyId: string
  property: { name?: string; address?: string }
  roomName?: string
  tenant: { name: string } | null
  category: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'emergency'
  status: 'open' | 'acknowledged' | 'scheduled' | 'in_progress' | 'awaiting_parts' | 'resolved' | 'closed' | 'cancelled'
  reportedDate: string
  resolvedDate?: string
  landlordNotes?: string
}

// ── API ───────────────────────────────────────────────────────────────────────

async function getMaintenanceRequests(): Promise<MaintenanceRequest[]> {
  const { data } = await api.get('/maintenance')
  return data.maintenanceRequests
}

async function createMaintenanceRequest(payload: object): Promise<MaintenanceRequest> {
  const { data } = await api.post('/maintenance', payload)
  return data.maintenanceRequest
}

async function respondToRequest(id: string, landlordNotes: string, status?: string) {
  const { data } = await api.patch(`/maintenance/${id}`, { landlordNotes, status })
  return data.maintenanceRequest
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_COLOURS: Record<string, string> = {
  low:       'bg-gray-100 text-gray-600',
  medium:    'bg-blue-100 text-blue-700',
  high:      'bg-orange-100 text-orange-700',
  urgent:    'bg-red-100 text-red-700',
  emergency: 'bg-red-600 text-white',
}

const STATUS_COLOURS: Record<string, string> = {
  open:           'bg-yellow-100 text-yellow-700',
  acknowledged:   'bg-blue-100 text-blue-700',
  scheduled:      'bg-purple-100 text-purple-700',
  in_progress:    'bg-sky-100 text-sky-700',
  awaiting_parts: 'bg-orange-100 text-orange-700',
  resolved:       'bg-green-100 text-green-700',
  closed:         'bg-gray-100 text-gray-500',
  cancelled:      'bg-gray-100 text-gray-400',
}

function toLabel(str: string) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const CATEGORIES = [
  'plumbing', 'electrical', 'heating', 'structural',
  'appliance', 'pest', 'damp_mould', 'security',
  'garden', 'cleaning', 'other',
]

const PRIORITIES = ['low', 'medium', 'high', 'urgent', 'emergency']

const LANDLORD_ACTIONS: Record<string, { label: string; next: string }> = {
  open:           { label: 'Acknowledge',      next: 'acknowledged' },
  acknowledged:   { label: 'Mark Scheduled',   next: 'scheduled' },
  scheduled:      { label: 'Mark In Progress', next: 'in_progress' },
  in_progress:    { label: 'Mark Resolved',    next: 'resolved' },
  awaiting_parts: { label: 'Mark Resolved',    next: 'resolved' },
  resolved:       { label: 'Close',            next: 'closed' },
}

// ── New Request Modal ─────────────────────────────────────────────────────────

function NewRequestModal({ onClose, propertyId }: { onClose: () => void; propertyId?: string }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: '', description: '', category: 'other', priority: 'medium',
  })

  const mutation = useMutation({
    mutationFn: createMaintenanceRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      toast.success('Maintenance request submitted')
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Failed to submit request')
    },
  })

  const canSubmit = form.title.trim().length > 0 && form.description.trim().length > 0 && Boolean(propertyId)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    mutation.mutate({ ...form, propertyId })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold">New Maintenance Request</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!propertyId && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">
              No active tenancy found. Please contact your landlord directly.
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-red-400">*</span></label>
            <input
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Leaking kitchen tap"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category <span className="text-red-400">*</span></label>
            <select
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{toLabel(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Priority <span className="text-red-400">*</span></label>
            <select
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
            >
              {PRIORITIES.map(p => <option key={p} value={p}>{toLabel(p)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description <span className="text-red-400">*</span></label>
            <textarea
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
              rows={4}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe the issue in detail..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button
              type="submit"
              disabled={!canSubmit || mutation.isPending}
              className="flex-1 px-4 py-2 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Respond Modal ─────────────────────────────────────────────────────────────

function RespondModal({ req, onClose }: { req: MaintenanceRequest; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [notes, setNotes] = useState(req.landlordNotes ?? '')
  const [nextStatus, setNextStatus] = useState(req.status)
  const action = LANDLORD_ACTIONS[req.status]

  const mutation = useMutation({
    mutationFn: () => respondToRequest(req.id, notes, nextStatus !== req.status ? nextStatus : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      toast.success('Response sent')
      onClose()
    },
    onError: () => toast.error('Failed to send response'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-base font-semibold">Respond to Request</h2>
            <p className="text-xs text-gray-500 mt-0.5">{req.title}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Tenant's description</p>
            <p className="text-sm text-gray-700">{req.description}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Your Response / Notes</label>
            <textarea
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
              rows={4}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Acknowledge the issue, provide an update, or note next steps..."
            />
          </div>
          {action && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="advance-status"
                checked={nextStatus === action.next}
                onChange={e => setNextStatus(e.target.checked ? action.next as typeof req.status : req.status)}
                className="rounded"
              />
              <label htmlFor="advance-status" className="text-xs text-gray-600">
                Also mark as <span className="font-medium">{toLabel(action.next)}</span>
              </label>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!notes.trim() || mutation.isPending}
              className="flex-1 px-4 py-2 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50"
            >
              {mutation.isPending ? 'Sending...' : 'Send Response'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Request Row ───────────────────────────────────────────────────────────────

function RequestRow({ req, isLandlord }: { req: MaintenanceRequest; isLandlord: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [showRespond, setShowRespond] = useState(false)

  const propertyLabel = req.property.name || req.property.address || '—'

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
          onClick={() => setExpanded(e => !e)}
        >
          <Wrench className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-900">{req.title}</span>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PRIORITY_COLOURS[req.priority])}>
                {toLabel(req.priority)}
              </span>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLOURS[req.status])}>
                {toLabel(req.status)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {toLabel(req.category)} · {propertyLabel}
              {isLandlord && req.tenant ? ` · ${req.tenant.name}` : ''}
              {req.roomName ? ` · ${req.roomName}` : ''}
            </p>
          </div>
          <span className="text-xs text-gray-400 shrink-0 mt-0.5">
            {new Date(req.reportedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
        </button>

        {expanded && (
          <div className="px-5 pb-4 border-t border-gray-50 space-y-3 pt-3">
            <p className="text-sm text-gray-700">{req.description}</p>

            {req.landlordNotes && (
              <div className="bg-sky-50 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-sky-700 mb-0.5">Landlord Response</p>
                <p className="text-sm text-sky-900">{req.landlordNotes}</p>
              </div>
            )}

            {isLandlord && !['closed', 'cancelled'].includes(req.status) && (
              <button
                onClick={() => setShowRespond(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600"
              >
                <MessageSquare className="w-4 h-4" />
                Respond
              </button>
            )}
          </div>
        )}
      </div>

      {showRespond && <RespondModal req={req} onClose={() => setShowRespond(false)} />}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const user = useAuthStore(s => s.user)
  const isLandlord = user?.role !== 'tenant'
  const [showModal, setShowModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: getMaintenanceRequests,
  })

  // Tenants need their propertyId to submit a request
  const { data: tenancies = [] } = useQuery({
    queryKey: ['tenancies'],
    queryFn: () => getTenancies(),
    enabled: !isLandlord,
  })
  const tenantPropertyId = !isLandlord ? tenancies[0]?.propertyId : undefined

  const filtered = statusFilter === 'all'
    ? requests
    : requests.filter(r => r.status === statusFilter)

  const openCount = requests.filter(r => !['resolved', 'closed', 'cancelled'].includes(r.status)).length

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Maintenance</h1>
          {openCount > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">{openCount} open request{openCount !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600"
        >
          <Plus className="w-4 h-4" />
          New Request
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'open', 'acknowledged', 'in_progress', 'resolved', 'closed'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
              statusFilter === s
                ? 'bg-sky-500 text-white border-sky-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300'
            )}
          >
            {toLabel(s)}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Wrench className="w-8 h-8 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No maintenance requests</p>
          <p className="text-xs text-gray-400 mt-1">
            {user?.role === 'tenant' ? 'Submit a request if something needs attention.' : 'No requests from tenants yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <RequestRow key={req.id} req={req} isLandlord={isLandlord} />
          ))}
        </div>
      )}

      {showModal && <NewRequestModal onClose={() => setShowModal(false)} propertyId={tenantPropertyId} />}
    </div>
  )
}
