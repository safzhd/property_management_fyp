import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, FileText, MapPin, User, Home, ChevronRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTenancies } from '@/api/tenancies'
import type { Tenancy, LifecycleStatus } from '@/types/tenancy'

const STATUS_LABELS: Record<LifecycleStatus, string> = {
  pending:     'Pending',
  onboarding:  'Onboarding',
  active:      'Active',
  notice:      'Notice',
  offboarding: 'Offboarding',
  ended:       'Ended',
  cancelled:   'Cancelled',
}

const STATUS_STYLES: Record<LifecycleStatus, string> = {
  pending:     'bg-yellow-50 text-yellow-700 border border-yellow-200',
  onboarding:  'bg-blue-50 text-blue-700 border border-blue-200',
  active:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
  notice:      'bg-orange-50 text-orange-700 border border-orange-200',
  offboarding: 'bg-purple-50 text-purple-700 border border-purple-200',
  ended:       'bg-gray-100 text-gray-500 border border-gray-200',
  cancelled:   'bg-red-50 text-red-600 border border-red-200',
}

const FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: 'All',         value: '' },
  { label: 'Active',      value: 'active' },
  { label: 'Pending',     value: 'pending' },
  { label: 'Onboarding',  value: 'onboarding' },
  { label: 'Notice',      value: 'notice' },
  { label: 'Offboarding', value: 'offboarding' },
  { label: 'Ended',       value: 'ended' },
  { label: 'Cancelled',   value: 'cancelled' },
]

function formatDate(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(amount)
}

function TenancyCard({ tenancy }: { tenancy: Tenancy }) {
  const navigate = useNavigate()
  const propertyDisplay = tenancy.property.name || tenancy.property.address

  return (
    <button
      onClick={() => navigate(`/app/tenancies/${tenancy.id}`)}
      className="w-full text-left bg-white rounded-xl border border-gray-200 hover:shadow-md hover:border-sky-200 transition-all group p-5"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left — tenant info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-sky-50 shrink-0">
            <User className="w-4 h-4 text-sky-500" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{tenancy.tenant.name}</p>
            <p className="text-xs text-gray-400 truncate">{tenancy.tenant.email}</p>
          </div>
        </div>

        {/* Right — status badge */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_STYLES[tenancy.lifecycleStatus])}>
            {STATUS_LABELS[tenancy.lifecycleStatus]}
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-sky-400 transition-colors" />
        </div>
      </div>

      {/* Property */}
      <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500">
        <Home className="w-3 h-3 shrink-0" />
        <span className="truncate">
          {propertyDisplay}
          {tenancy.roomName ? ` — ${tenancy.roomName}` : ''}
        </span>
        <span className="text-gray-300">·</span>
        <MapPin className="w-3 h-3 shrink-0" />
        <span>{tenancy.property.postcode}</span>
      </div>

      {/* Rent + dates */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          <span className="font-semibold text-gray-800">
            {formatCurrency(tenancy.rentAmount)}
          </span>
          <span className="ml-1">/ {tenancy.rentFrequency}</span>
        </div>
        <div className="text-xs text-gray-400">
          {formatDate(tenancy.startDate)}
          {tenancy.endDate ? ` → ${formatDate(tenancy.endDate)}` : ' (periodic)'}
        </div>
      </div>
    </button>
  )
}

export default function TenanciesPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const { data: tenancies = [], isLoading } = useQuery({
    queryKey: ['tenancies', statusFilter],
    queryFn: () => getTenancies(statusFilter ? { lifecycleStatus: statusFilter } : undefined),
  })

  const filtered = tenancies.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.tenant.name.toLowerCase().includes(q) ||
      t.tenant.email.toLowerCase().includes(q) ||
      (t.property.name ?? '').toLowerCase().includes(q) ||
      t.property.address.toLowerCase().includes(q) ||
      t.property.postcode.toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tenancies</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading ? 'Loading…' : `${tenancies.length} tenancy${tenancies.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => navigate('/app/tenancies/new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          New tenancy
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tenant, property…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === opt.value
                  ? 'bg-sky-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-sky-300'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-gray-200 bg-white">
          <FileText className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-500">
            {tenancies.length === 0 ? 'No tenancies yet' : 'No results match your search'}
          </p>
          {tenancies.length === 0 && (
            <button
              onClick={() => navigate('/app/tenancies/new')}
              className="mt-3 text-xs text-sky-500 hover:text-sky-700 font-medium"
            >
              Add your first tenancy
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <TenancyCard key={t.id} tenancy={t} />
          ))}
        </div>
      )}
    </div>
  )
}
