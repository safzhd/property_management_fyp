import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, AlertCircle, Info, Bell, CheckCheck, ArrowRight, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getSmartAlerts, getNotifications, markAllAsRead, deleteNotification } from '@/api/notifications'
import type { NotificationSeverity } from '@/api/notifications'

// ── Severity config ───────────────────────────────────────────────────────────

const SEVERITY_ICON: Record<NotificationSeverity, React.ReactNode> = {
  high:    <AlertCircle className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  normal:  <Info className="w-4 h-4" />,
  low:     <Info className="w-4 h-4" />,
}

const SEVERITY_STYLE: Record<NotificationSeverity, string> = {
  high:    'bg-red-50 text-red-500 border-red-200',
  warning: 'bg-amber-50 text-amber-600 border-amber-200',
  normal:  'bg-sky-50 text-sky-500 border-sky-200',
  low:     'bg-gray-50 text-gray-400 border-gray-200',
}

const SEVERITY_LABEL: Record<NotificationSeverity, string> = {
  high:    'Action Required',
  warning: 'Attention',
  normal:  'Info',
  low:     'Low',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Alert card ────────────────────────────────────────────────────────────────

function AlertCard({ severity, title, message, createdAt, tenancyId, type }: {
  severity: NotificationSeverity
  title: string
  message: string
  createdAt: string
  tenancyId?: string | null
  type?: string
}) {
  const navigate = useNavigate()
  const isMaintenance = type === 'maintenance_new' || type === 'maintenance_update'
  const link = isMaintenance ? '/app/maintenance' : tenancyId ? `/app/tenancies/${tenancyId}` : null
  const linkLabel = isMaintenance ? 'View Maintenance' : 'View Tenancy'

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border',
        isMaintenance ? 'bg-orange-50 border-orange-200' : SEVERITY_STYLE[severity],
        link ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
      )}
      onClick={() => link && navigate(link)}
    >
      <div className="mt-0.5 shrink-0">
        {isMaintenance
          ? <Wrench className="w-4 h-4 text-orange-500" />
          : SEVERITY_ICON[severity]
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className={cn('inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1', isMaintenance ? 'bg-orange-100 text-orange-600' : SEVERITY_STYLE[severity])}>
              {isMaintenance ? 'Maintenance' : SEVERITY_LABEL[severity]}
            </span>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-sm text-gray-600 mt-0.5">{message}</p>
          </div>
          <span className="text-xs text-gray-400 shrink-0 mt-0.5">{formatDate(createdAt)}</span>
        </div>
        {link && (
          <span className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-sky-600">
            {linkLabel} <ArrowRight className="w-3 h-3" />
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const queryClient = useQueryClient()

  const { data: smartData, isLoading: loadingSmart } = useQuery({
    queryKey: ['notifications-smart'],
    queryFn: getSmartAlerts,
  })

  const { data: storedData, isLoading: loadingStored } = useQuery({
    queryKey: ['notifications-stored'],
    queryFn: () => getNotifications(),
  })

  const markAllMutation = useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-stored'] })
      toast.success('All marked as read')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications-stored'] }),
  })

  const smartAlerts  = smartData?.alerts ?? []
  const storedNotifs = storedData?.notifications ?? []
  const unreadCount  = storedData?.unreadCount ?? 0
  const isLoading    = loadingSmart || loadingStored

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading ? 'Loading…' : `${smartAlerts.length} active alert${smartAlerts.length !== 1 ? 's' : ''}`}
            {unreadCount > 0 && ` · ${unreadCount} unread`}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark All Read
          </button>
        )}
      </div>

      {/* Smart alerts — always live from tenancy data */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Active Alerts</h2>
        {loadingSmart ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : smartAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 rounded-xl border border-dashed border-gray-200 bg-white">
            <Bell className="w-7 h-7 text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-500">No active alerts</p>
            <p className="text-xs text-gray-400 mt-0.5">All tenancies are on track</p>
          </div>
        ) : (
          <div className="space-y-3">
            {smartAlerts.map(alert => (
              <AlertCard
                key={alert.id}
                severity={alert.severity}
                title={alert.title}
                message={alert.message}
                createdAt={alert.createdAt}
                tenancyId={alert.tenancyId}
                type={alert.type}
              />
            ))}
          </div>
        )}
      </section>

      {/* Stored notifications */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Responses & Updates</h2>
        {storedNotifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 rounded-xl border border-dashed border-gray-200 bg-white">
            <p className="text-sm font-medium text-gray-500">No responses yet</p>
            <p className="text-xs text-gray-400 mt-0.5">Landlord responses to your requests will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {storedNotifs.map(n => {
              const isMaintenance = n.type === 'maintenance_new' || n.type === 'maintenance_update'
              return (
              <div
                key={n.id}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-xl border transition-colors',
                  isMaintenance ? 'bg-orange-50 border-orange-200' :
                  n.isRead ? 'bg-white border-gray-200' : 'bg-sky-50 border-sky-200'
                )}
              >
                {isMaintenance
                  ? <Wrench className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                  : <div className={cn('w-2 h-2 rounded-full shrink-0 mt-1.5', n.isRead ? 'bg-gray-300' : 'bg-sky-500')} />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(n.id)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors mt-0.5"
                >
                  ×
                </button>
              </div>
            )})}

          </div>
        )}
      </section>
    </div>
  )
}
