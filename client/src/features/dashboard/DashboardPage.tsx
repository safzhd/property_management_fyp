import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Building2, FileText, TrendingUp, TrendingDown, Plus, ArrowRight, AlertTriangle, AlertCircle, FileCheck, PoundSterling, Home } from 'lucide-react'
import { getProperties } from '@/api/properties'
import { getTenancies } from '@/api/tenancies'
import { getTransactionSummary } from '@/api/transactions'
import { getSmartAlerts, getActivity } from '@/api/notifications'
import type { ActivityEvent } from '@/api/notifications'
import { useAuthStore } from '@/store/authStore'
import type { LifecycleStatus } from '@/types/tenancy'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<LifecycleStatus, string> = {
  pending:     'Draft',
  onboarding:  'Onboarding',
  active:      'Active',
  notice:      'Notice Served',
  offboarding: 'Offboarding',
  ended:       'Ended',
  cancelled:   'Cancelled',
}

const STATUS_COLOUR: Record<LifecycleStatus, string> = {
  pending:     'bg-gray-400',
  onboarding:  'bg-amber-400',
  active:      'bg-emerald-400',
  notice:      'bg-orange-400',
  offboarding: 'bg-purple-400',
  ended:       'bg-slate-400',
  cancelled:   'bg-red-400',
}

const STATUS_CHIP: Record<LifecycleStatus, string> = {
  pending:     'bg-gray-100 text-gray-600',
  onboarding:  'bg-amber-100 text-amber-700',
  active:      'bg-emerald-100 text-emerald-700',
  notice:      'bg-orange-100 text-orange-700',
  offboarding: 'bg-purple-100 text-purple-700',
  ended:       'bg-slate-100 text-slate-600',
  cancelled:   'bg-red-100 text-red-600',
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const year = new Date().getFullYear()

  const { data: properties = [] } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties(),
  })

  const { data: tenancies = [] } = useQuery({
    queryKey: ['tenancies'],
    queryFn: () => getTenancies(),
  })

  const { data: summary } = useQuery({
    queryKey: ['transactions-summary', year],
    queryFn: () => getTransactionSummary({ yearFrom: year, yearTo: year }),
  })

  const { data: activityData } = useQuery({
    queryKey: ['activity'],
    queryFn: () => getActivity(),
    refetchInterval: 60_000,
  })

  const { data: alertsData } = useQuery({
    queryKey: ['smart-alerts'],
    queryFn: () => getSmartAlerts(),
    refetchInterval: 60_000,
  })

  const defects = (alertsData?.alerts ?? []).filter(
    (a) => a.severity === 'high' || a.severity === 'warning'
  )

  const activeProperties = properties.filter((p) => p.status !== 'archived')
  const activeTenancies  = tenancies.filter((t) => t.lifecycleStatus === 'active')

  // Tenancy pipeline counts
  const pipeline: Partial<Record<LifecycleStatus, number>> = {}
  for (const t of tenancies) {
    pipeline[t.lifecycleStatus] = (pipeline[t.lifecycleStatus] ?? 0) + 1
  }

  const pipelineOrder: LifecycleStatus[] = ['pending', 'onboarding', 'active', 'notice', 'offboarding', 'ended', 'cancelled']
  const activePipelineRows = pipelineOrder.filter((s) => (pipeline[s] ?? 0) > 0)

  // Recent tenancies (last 5 by start date)
  const recentTenancies = [...tenancies]
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .slice(0, 5)

  const income   = summary?.summary.totalIncome   ?? 0
  const expenses = summary?.summary.totalExpenses ?? 0
  const net      = income - expenses

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Welcome back{user?.givenName ? `, ${user.givenName}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Here's what's happening across your portfolio</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Building2 className="w-4 h-4" />}
          label="Properties"
          value={String(activeProperties.length)}
          sub={`${properties.filter(p => p.status === 'archived').length} archived`}
          colour="sky"
        />
        <StatCard
          icon={<FileText className="w-4 h-4" />}
          label="Active Tenancies"
          value={String(activeTenancies.length)}
          sub={`${tenancies.length} total`}
          colour="emerald"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label={`${year} Income`}
          value={fmt(income)}
          sub="Year to date"
          colour="emerald"
        />
        <StatCard
          icon={<TrendingDown className="w-4 h-4" />}
          label={`${year} Expenses`}
          value={fmt(expenses)}
          sub={net >= 0 ? `${fmt(net)} net profit` : `${fmt(Math.abs(net))} net loss`}
          colour={net >= 0 ? 'sky' : 'red'}
        />
      </div>

      {/* Defects / Active Alerts */}
      {defects.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-semibold text-gray-900">Active Alerts</h2>
              <span className="ml-1 text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                {defects.length}
              </span>
            </div>
            <Link to="/app/notifications" className="text-xs text-sky-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {defects.map((alert) => {
              const isHigh = alert.severity === 'high'
              return (
                <Link
                  key={alert.id}
                  to={`/app/tenancies/${alert.tenancyId}`}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border transition-colors hover:brightness-95',
                    isHigh
                      ? 'bg-red-50 border-red-200'
                      : 'bg-amber-50 border-amber-200'
                  )}
                >
                  <AlertCircle className={cn('w-4 h-4 mt-0.5 shrink-0', isHigh ? 'text-red-500' : 'text-amber-500')} />
                  <div className="min-w-0">
                    <p className={cn('text-sm font-semibold', isHigh ? 'text-red-700' : 'text-amber-700')}>
                      {alert.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{alert.message}</p>
                  </div>
                  <span className={cn(
                    'ml-auto text-xs font-semibold px-2 py-0.5 rounded-full shrink-0',
                    isHigh ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                  )}>
                    {isHigh ? 'High' : 'Warning'}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tenancy pipeline */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Tenancy Pipeline</h2>
            <Link to="/app/tenancies" className="text-xs text-sky-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {activePipelineRows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No tenancies yet</p>
          ) : (
            <div className="space-y-3">
              {activePipelineRows.map((status) => {
                const count = pipeline[status] ?? 0
                const total = tenancies.length
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600">{STATUS_LABEL[status]}</span>
                      <span className="text-xs text-gray-400">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', STATUS_COLOUR[status])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent tenancies */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Recent Tenancies</h2>
            <Link to="/app/tenancies" className="text-xs text-sky-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentTenancies.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No tenancies yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentTenancies.map((t) => (
                <Link
                  key={t.id}
                  to={`/app/tenancies/${t.id}`}
                  className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.tenant.name}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {t.property.address}{t.roomName ? ` · ${t.roomName}` : ''}
                    </p>
                  </div>
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full ml-3 shrink-0', STATUS_CHIP[t.lifecycleStatus])}>
                    {STATUS_LABEL[t.lifecycleStatus]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <ActivityFeed events={activityData?.events ?? []} />

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <QuickAction to="/app/tenancies/new" label="New Tenancy" />
          <QuickAction to="/app/properties/new" label="Add Property" />
          <QuickAction to="/app/transactions" label="Add Transaction" />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon, label, value, sub, colour,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  colour: 'sky' | 'emerald' | 'red'
}) {
  const iconBg = { sky: 'bg-sky-50 text-sky-500', emerald: 'bg-emerald-50 text-emerald-500', red: 'bg-red-50 text-red-500' }[colour]
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={cn('inline-flex items-center justify-center w-8 h-8 rounded-lg mb-3', iconBg)}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      <p className="text-xs font-medium text-gray-500 mt-1">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

function QuickAction({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
    >
      <Plus className="w-3.5 h-3.5" />
      {label}
    </Link>
  )
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

const AVATAR_COLOURS = [
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
]

function avatarColour(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length]
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const EVENT_ICON: Record<ActivityEvent['type'], React.ReactNode> = {
  tenancy_created:   <Home        className="w-3.5 h-3.5 text-sky-500" />,
  document_uploaded: <FileCheck   className="w-3.5 h-3.5 text-violet-500" />,
  payment_received:  <PoundSterling className="w-3.5 h-3.5 text-emerald-500" />,
}

const EVENT_DOT: Record<ActivityEvent['type'], string> = {
  tenancy_created:   'bg-sky-400',
  document_uploaded: 'bg-violet-400',
  payment_received:  'bg-emerald-400',
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
        <Link to="/app/notifications" className="text-xs text-sky-600 hover:underline flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No recent activity</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {events.map(event => (
            <div
              key={event.id}
              className={cn(
                'flex items-center gap-3.5 px-5 py-3.5 hover:bg-gray-50 transition-colors',
                event.tenancyId ? 'cursor-pointer' : ''
              )}
              onClick={() => event.tenancyId && (window.location.href = `/app/tenancies/${event.tenancyId}`)}
            >
              {/* Avatar */}
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0', avatarColour(event.tenantName))}>
                {event.initials}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {EVENT_ICON[event.type]}
                  <p className="text-xs font-semibold text-gray-800">{event.title}</p>
                </div>
                <p className="text-xs text-gray-400 truncate">{event.description}</p>
              </div>

              {/* Time + dot */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(event.createdAt)}</span>
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', EVENT_DOT[event.type])} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
