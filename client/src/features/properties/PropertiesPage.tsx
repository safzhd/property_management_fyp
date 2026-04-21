import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Building2, Search } from 'lucide-react'
import { getProperties } from '@/api/properties'
import { PropertyCard } from './components/PropertyCard'
import type { PropertyStatus, PropertyType } from '@/types/property'

const STATUS_FILTERS: { label: string; value: PropertyStatus | 'all' }[] = [
  { label: 'All',      value: 'all' },
  { label: 'Active',   value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Archived', value: 'archived' },
]

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 rounded w-3/5" />
          <div className="h-3 bg-gray-100 rounded w-2/5" />
        </div>
      </div>
      <div className="h-3 bg-gray-100 rounded w-1/3 mt-4" />
      <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
        <div className="h-3 bg-gray-100 rounded w-16" />
        <div className="h-3 bg-gray-100 rounded w-16" />
      </div>
    </div>
  )
}

function EmptyState({ filtered, isHmoTab }: { filtered: boolean; isHmoTab: boolean }) {
  const navigate = useNavigate()
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-50 mb-4">
        <Building2 className="w-7 h-7 text-sky-300" />
      </div>
      <p className="text-base font-semibold text-gray-900">
        {filtered
          ? 'No properties match this filter'
          : isHmoTab
            ? 'No HMO properties yet'
            : 'No properties yet'}
      </p>
      <p className="text-sm text-gray-500 mt-1 max-w-xs">
        {filtered
          ? 'Try a different search or status filter.'
          : isHmoTab
            ? 'Add an HMO property to get started.'
            : 'Add your first property to get started.'}
      </p>
      {!filtered && (
        <button
          onClick={() => navigate('/app/properties/new')}
          className="mt-5 flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add property
        </button>
      )}
    </div>
  )
}

type ViewTab = 'all' | PropertyType

const TYPE_TAB_STYLE: Record<PropertyType, { active: string; badge: string; label: string }> = {
  hmo:   { active: 'border-amber-400 text-amber-600',  badge: 'bg-amber-50 text-amber-600',   label: 'HMOs' },
  house: { active: 'border-blue-400 text-blue-600',    badge: 'bg-blue-50 text-blue-600',     label: 'Houses' },
  flat:  { active: 'border-purple-400 text-purple-600',badge: 'bg-purple-50 text-purple-600', label: 'Flats' },
  other: { active: 'border-gray-400 text-gray-600',    badge: 'bg-gray-100 text-gray-600',    label: 'Other' },
}

export default function PropertiesPage() {
  const navigate = useNavigate()
  const [viewTab, setViewTab] = useState<ViewTab>('all')
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const { data: properties = [], isLoading, isError } = useQuery({
    queryKey: ['properties', statusFilter],
    queryFn: () => getProperties(statusFilter !== 'all' ? { status: statusFilter } : undefined),
  })

  const allCount = properties.length

  // Build tabs dynamically from types that actually exist in the data
  const typeCounts = properties.reduce<Partial<Record<PropertyType, number>>>((acc, p) => {
    const t = p.propertyType
    acc[t] = (acc[t] ?? 0) + 1
    // Also count isHmo properties under hmo tab
    if (p.isHmo && t !== 'hmo') acc['hmo'] = (acc['hmo'] ?? 0) + 1
    return acc
  }, {})

  // Fixed display order
  const TYPE_ORDER: PropertyType[] = ['hmo', 'house', 'flat', 'other']
  const activeTabs = TYPE_ORDER.filter(t => (typeCounts[t] ?? 0) > 0)

  const filtered = properties
    .filter((p) => {
      if (viewTab !== 'all') {
        const isHmoTab = viewTab === 'hmo'
        if (isHmoTab && p.propertyType !== 'hmo' && !p.isHmo) return false
        if (!isHmoTab && p.propertyType !== viewTab) return false
      }
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        p.propertyName?.toLowerCase().includes(q) ||
        p.addressLine1.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.postcode.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (viewTab === 'hmo') {
        const aIncomplete = (a.propertyType === 'hmo' || a.isHmo) && (a.roomCount ?? 0) === 0
        const bIncomplete = (b.propertyType === 'hmo' || b.isHmo) && (b.roomCount ?? 0) === 0
        if (aIncomplete && !bIncomplete) return -1
        if (!aIncomplete && bIncomplete) return 1
      }
      return 0
    })

  const isFiltered = viewTab !== 'all' || statusFilter !== 'all' || search.trim() !== ''

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Properties</h2>
          {!isLoading && (
            <p className="text-sm text-gray-500 mt-0.5">
              {allCount} {allCount === 1 ? 'property' : 'properties'} total
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/app/properties/new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add property
        </button>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {/* All */}
        <button
          onClick={() => setViewTab('all')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            viewTab === 'all'
              ? 'border-sky-300 text-sky-500'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          All properties
          {!isLoading && (
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
              viewTab === 'all' ? 'bg-sky-100 text-sky-600' : 'bg-gray-100 text-gray-500'
            }`}>
              {allCount}
            </span>
          )}
        </button>

        {/* One tab per type present in data */}
        {!isLoading && activeTabs.map(type => {
          const style = TYPE_TAB_STYLE[type]
          const count = typeCounts[type] ?? 0
          const active = viewTab === type
          return (
            <button
              key={type}
              onClick={() => setViewTab(type)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active ? style.active : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {style.label}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                active ? style.badge : 'bg-gray-100 text-gray-500'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder={viewTab === 'all' ? 'Search properties…' : `Search ${TYPE_TAB_STYLE[viewTab as PropertyType]?.label ?? ''}s…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-4 h-9 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent w-56 transition"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {isError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Failed to load properties. Please refresh and try again.
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
          : filtered.length === 0
            ? <EmptyState filtered={isFiltered} isHmoTab={viewTab === 'hmo'} />
            : filtered.map((p) => <PropertyCard key={p.id} property={p} />)
        }
      </div>
    </div>
  )
}
