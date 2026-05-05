import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import {
  getInspections, TYPE_LABELS,
  type Inspection, type InspectionType,
} from '@/api/inspections'
import {
  Flame, Users, Sparkles, Leaf, Home, ShieldCheck, BellRing, ClipboardList,
  CheckCircle2, Clock, Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MaintenanceRequest {
  id: string
  propertyId: string
  category: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'emergency'
  status: string
  reportedDate: string
  tenant: { name: string } | null
  roomName?: string
}

// ── Config ────────────────────────────────────────────────────────────────────

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

const RESULT_STYLE = {
  pass:          'bg-green-100 text-green-700',
  issues_noted:  'bg-amber-100 text-amber-700',
  fail:          'bg-red-100 text-red-700',
}

const RESULT_LABEL = {
  pass: 'Pass', issues_noted: 'Issues Noted', fail: 'Fail',
}

const PRIORITY_STYLE: Record<string, string> = {
  low:       'bg-gray-100 text-gray-600',
  medium:    'bg-blue-100 text-blue-700',
  high:      'bg-orange-100 text-orange-700',
  urgent:    'bg-red-100 text-red-700',
  emergency: 'bg-red-600 text-white',
}

const STATUS_STYLE: Record<string, string> = {
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InspectionsTab({ propertyId }: { propertyId: string }) {
  const [section, setSection] = useState<'inspections' | 'maintenance'>('inspections')

  const { data: inspData, isLoading: loadingInsp } = useQuery({
    queryKey: ['inspections', propertyId],
    queryFn: () => getInspections({ propertyId }),
  })

  const { data: maintData, isLoading: loadingMaint } = useQuery({
    queryKey: ['maintenance'],
    queryFn: async () => {
      const { data } = await api.get('/maintenance')
      return data.maintenanceRequests as MaintenanceRequest[]
    },
  })

  const inspections = inspData?.inspections ?? []
  const maintenance = (maintData ?? []).filter(r => r.propertyId === propertyId)

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-1">
        {(['inspections', 'maintenance'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              section === s
                ? 'bg-sky-500 text-white border-sky-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300'
            )}
          >
            {s === 'inspections' ? 'Inspections' : 'Maintenance'}
            {s === 'inspections' && inspections.length > 0 && (
              <span className={cn('ml-1.5 px-1.5 py-0.5 rounded-full text-xs', section === s ? 'bg-white/20' : 'bg-gray-100 text-gray-500')}>
                {inspections.length}
              </span>
            )}
            {s === 'maintenance' && maintenance.length > 0 && (
              <span className={cn('ml-1.5 px-1.5 py-0.5 rounded-full text-xs', section === s ? 'bg-white/20' : 'bg-gray-100 text-gray-500')}>
                {maintenance.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Inspections list */}
      {section === 'inspections' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loadingInsp ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />)}
            </div>
          ) : inspections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32">
              <CheckCircle2 className="w-7 h-7 text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-500">No inspections logged yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {inspections.map((insp: Inspection) => {
                const Icon = TYPE_ICON[insp.type]
                return (
                  <div key={insp.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gray-100">
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
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Maintenance list */}
      {section === 'maintenance' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loadingMaint ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />)}
            </div>
          ) : maintenance.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32">
              <Wrench className="w-7 h-7 text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-500">No maintenance requests</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {maintenance.map(req => (
                <div key={req.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-orange-50">
                    <Wrench className="w-4 h-4 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{req.title}</span>
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', PRIORITY_STYLE[req.priority])}>
                        {toLabel(req.priority)}
                      </span>
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', STATUS_STYLE[req.status] ?? 'bg-gray-100 text-gray-500')}>
                        {toLabel(req.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(req.reportedDate)}
                      {req.tenant && ` · ${req.tenant.name}`}
                      {req.roomName && ` · ${req.roomName}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3 text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
