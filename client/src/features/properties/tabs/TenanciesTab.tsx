import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, ChevronRight } from 'lucide-react'
import { getTenancies } from '@/api/tenancies'
import { cn } from '@/lib/utils'
import type { Tenancy, LifecycleStatus } from '@/types/tenancy'

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<LifecycleStatus, string> = {
  pending:     'bg-gray-100 text-gray-600',
  onboarding:  'bg-blue-100 text-blue-700',
  active:      'bg-emerald-100 text-emerald-700',
  notice:      'bg-amber-100 text-amber-700',
  offboarding: 'bg-orange-100 text-orange-700',
  ended:       'bg-gray-100 text-gray-500',
  cancelled:   'bg-red-100 text-red-500',
}

const STATUS_LABEL: Record<LifecycleStatus, string> = {
  pending:     'Pending',
  onboarding:  'Onboarding',
  active:      'Active',
  notice:      'Notice',
  offboarding: 'Offboarding',
  ended:       'Ended',
  cancelled:   'Cancelled',
}

const ALL_STATUSES: LifecycleStatus[] = ['pending', 'onboarding', 'active', 'notice', 'offboarding', 'ended', 'cancelled']

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatRent(amount: number, frequency: string) {
  return `£${amount.toLocaleString('en-GB')} / ${frequency}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TenanciesTab({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate()
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState<LifecycleStatus | ''>('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['tenancies', { propertyId }],
    queryFn:  () => getTenancies({ propertyId }),
  })

  const filtered = useMemo(() => {
    let list = [...data].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    if (statusFilter) list = list.filter(t => t.lifecycleStatus === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(t =>
        t.tenant.name.toLowerCase().includes(q) ||
        t.tenant.email.toLowerCase().includes(q) ||
        (t.roomName ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [data, search, statusFilter])

  return (
    <div className="space-y-3">
      {/* Search + filter row */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by tenant or room…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value as LifecycleStatus | '')}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white text-gray-600"
        >
          <option value="">All Statuses</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32">
            <FileText className="w-7 h-7 text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-500">
              {data.length === 0 ? 'No tenancies for this property' : 'No results match your search'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((t: Tenancy) => (
              <button
                key={t.id}
                onClick={() => navigate(`/app/tenancies/${t.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center shrink-0 text-sky-600 text-xs font-bold">
                  {t.tenant.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{t.tenant.name}</span>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', STATUS_STYLE[t.lifecycleStatus])}>
                      {STATUS_LABEL[t.lifecycleStatus]}
                    </span>
                    {t.roomName && (
                      <span className="text-[10px] text-gray-400 font-medium">{t.roomName}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(t.startDate)}{t.endDate ? ` – ${formatDate(t.endDate)}` : ' · Ongoing'}
                    {' · '}{formatRent(t.rentAmount, t.rentFrequency)}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {!isLoading && data.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          {filtered.length} of {data.length} {data.length !== 1 ? 'tenancies' : 'tenancy'} · Newest first
        </p>
      )}
    </div>
  )
}
