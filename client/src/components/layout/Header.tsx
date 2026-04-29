import { useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bell, Home, FileCheck, PoundSterling } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { getNotifications, getActivity, type ActivityEvent } from '@/api/notifications'

const pageTitles: Record<string, string> = {
  '/app/dashboard':     'Dashboard',
  '/app/properties':    'Properties',
  '/app/rooms':         'Rooms',
  '/app/tenancies':     'Tenancies',
  '/app/payments':      'Payments',
  '/app/compliance':    'Compliance',
  '/app/maintenance':   'Maintenance',
  '/app/documents':     'Documents',
  '/app/notifications': 'Notifications',
  '/app/my-tenancy':    'My Tenancy',
  '/app/admin':         'Admin',
}

const AVATAR_COLOURS = [
  'bg-sky-100 text-sky-600',
  'bg-violet-100 text-violet-600',
  'bg-emerald-100 text-emerald-600',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-600',
  'bg-indigo-100 text-indigo-600',
]

function avatarColour(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length]
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  if (hrs < 48)  return 'Yesterday'
  return `${Math.floor(hrs / 24)}d ago`
}

const EVENT_ICON: Record<ActivityEvent['type'], JSX.Element> = {
  tenancy_created:   <Home className="w-3 h-3" />,
  document_uploaded: <FileCheck className="w-3 h-3" />,
  payment_received:  <PoundSterling className="w-3 h-3" />,
}

const EVENT_DOT: Record<ActivityEvent['type'], string> = {
  tenancy_created:   'bg-sky-500',
  document_uploaded: 'bg-violet-500',
  payment_received:  'bg-emerald-500',
}

export function Header() {
  const location  = useLocation()
  const user      = useAuthStore((s) => s.user)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [open, setOpen]           = useState(false)
  const [activeTab, setActiveTab] = useState<'alerts' | 'events'>('alerts')

  const isLandlord = user?.role === 'landlord' || user?.role === 'admin'

  const { data: notifData } = useQuery({
    queryKey: ['notifications-header'],
    queryFn:  () => getNotifications(),
    enabled:  open,
    staleTime: 30_000,
  })

  const { data: activityData } = useQuery({
    queryKey: ['activity-header'],
    queryFn:  getActivity,
    enabled:  open && isLandlord,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  function handleMouseEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }

  function handleMouseLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }

  const normalisedPath = location.pathname.replace(/^\/dev/, '/app')
  const title = pageTitles[normalisedPath] ?? 'PropManage'

  return (
    <header className="flex items-center justify-between px-6 h-16 bg-white border-b border-gray-200 shrink-0">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Bell with dropdown */}
        <div
          className="relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button className="relative flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <Bell className="w-4 h-4" />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-gray-100">
                <button
                  onClick={() => setActiveTab('alerts')}
                  className={`flex-1 px-4 py-3 text-xs font-semibold transition-colors ${
                    activeTab === 'alerts'
                      ? 'text-gray-900 border-b-2 border-sky-500 -mb-px'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Alerts
                </button>
                {isLandlord && (
                  <button
                    onClick={() => setActiveTab('events')}
                    className={`flex-1 px-4 py-3 text-xs font-semibold transition-colors ${
                      activeTab === 'events'
                        ? 'text-gray-900 border-b-2 border-sky-500 -mb-px'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    Events
                  </button>
                )}
              </div>

              {/* Alerts tab */}
              {activeTab === 'alerts' && (
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                  {!notifData || notifData.notifications.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-gray-400">No notifications</p>
                  ) : (
                    notifData.notifications.slice(0, 8).map(n => (
                      <div key={n.id} className="px-4 py-3">
                        <p className="text-xs font-medium text-gray-800 leading-snug">{n.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Events tab */}
              {activeTab === 'events' && isLandlord && (
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                  {!activityData || activityData.events.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-gray-400">No recent events</p>
                  ) : (
                    activityData.events.slice(0, 10).map(ev => (
                      <div key={ev.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${avatarColour(ev.tenantName)}`}>
                          {ev.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${EVENT_DOT[ev.type]}`} />
                            <p className="text-xs font-medium text-gray-800 truncate">{ev.title}</p>
                            {ev.paidLate && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700">
                                Paid Late
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{ev.description}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(ev.createdAt)}</p>
                        </div>
                        <span className={`mt-0.5 p-1 rounded-md text-white shrink-0 ${
                          ev.type === 'payment_received' ? 'bg-emerald-500' :
                          ev.type === 'document_uploaded' ? 'bg-violet-500' : 'bg-sky-500'
                        }`}>
                          {EVENT_ICON[ev.type]}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-gray-100 px-4 py-2.5">
                <a
                  href="/app/notifications"
                  className="text-[11px] text-sky-500 hover:text-sky-600 font-medium"
                >
                  View all notifications →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Avatar */}
        {user && (
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-300/20 text-sky-500 text-xs font-bold select-none">
            {user.givenName[0]}{user.lastName[0]}
          </div>
        )}
      </div>
    </header>
  )
}
