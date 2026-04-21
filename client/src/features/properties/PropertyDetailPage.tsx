import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Building2, MapPin } from 'lucide-react'
import { getProperty } from '@/api/properties'
import { OverviewTab } from './tabs/OverviewTab'
import { RoomsTab } from './tabs/RoomsTab'
import { DocumentsTab } from './tabs/DocumentsTab'
import { StubTab } from './tabs/StubTab'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'rooms' | 'tenancies' | 'compliance' | 'maintenance' | 'documents'

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const initialTab = (location.state as { tab?: Tab } | null)?.tab ?? 'overview'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const { data: property, isLoading, isError } = useQuery({
    queryKey: ['property', id],
    queryFn: () => getProperty(id!),
    enabled: !!id,
  })

  const isHmo = property?.propertyType === 'hmo' || property?.isHmo === true

  const allTabs: { id: Tab; label: string; hmoOnly?: boolean }[] = [
    { id: 'overview',    label: 'Overview' },
    { id: 'rooms',       label: 'Rooms',       hmoOnly: true },
    { id: 'tenancies',   label: 'Tenancies' },
    { id: 'compliance',  label: 'Compliance' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'documents',   label: 'Documents' },
  ]
  const tabs = allTabs.filter(t => !t.hmoOnly || isHmo)

  if (isLoading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-4 bg-gray-100 rounded w-1/4" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (isError || !property) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-gray-500 text-sm">Property not found or failed to load.</p>
        <button onClick={() => navigate(-1)} className="text-sky-400 text-sm hover:underline">Go back</button>
      </div>
    )
  }

  const displayName = property.propertyName
    ?? `${property.doorNumber ? property.doorNumber + ' ' : ''}${property.addressLine1}`

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors mt-0.5 shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 truncate">{displayName}</h2>
            <span className={cn(
              'text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0',
              property.propertyType === 'hmo'   ? 'bg-amber-50 text-amber-700 border border-amber-200' :
              property.propertyType === 'flat'  ? 'bg-purple-50 text-purple-700 border border-purple-200' :
              property.propertyType === 'house' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
              'bg-gray-100 text-gray-600 border border-gray-200'
            )}>
              {property.propertyType.toUpperCase()}
            </span>
            <span className={cn(
              'text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0',
              property.status === 'active'   ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
              property.status === 'inactive' ? 'bg-gray-100 text-gray-500 border border-gray-200' :
              'bg-red-50 text-red-600 border border-red-200'
            )}>
              {property.status.charAt(0).toUpperCase() + property.status.slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{property.city}, {property.postcode}</span>
          </div>
        </div>

        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-sky-50 shrink-0">
          <Building2 className="w-5 h-5 text-sky-400" />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.id
                ? 'border-sky-300 text-sky-500'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview'    && <OverviewTab property={property} />}
        {activeTab === 'rooms'       && <RoomsTab propertyId={property.id} />}
        {activeTab === 'tenancies'   && <StubTab label="Tenancies" />}
        {activeTab === 'compliance'  && <StubTab label="Compliance" />}
        {activeTab === 'maintenance' && <StubTab label="Maintenance" />}
        {activeTab === 'documents'   && <DocumentsTab propertyId={property.id} isHmo={isHmo} />}
      </div>
    </div>
  )
}
