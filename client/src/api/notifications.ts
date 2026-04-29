import { api } from '@/lib/axios'

export type NotificationSeverity = 'high' | 'warning' | 'normal' | 'low'

export interface SmartAlert {
  id: string
  type: string
  severity: NotificationSeverity
  title: string
  message: string
  tenancyId: string
  createdAt: string
}

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  message: string
  relatedEntityType: string | null
  relatedEntityId: string | null
  priority: string
  readAt: string | null
  isRead: boolean
  createdAt: string
}

export interface ActivityEvent {
  id:          string
  type:        'tenancy_created' | 'document_uploaded' | 'payment_received'
  title:       string
  description: string
  tenantName:  string
  initials:    string
  tenancyId:   string | null
  createdAt:   string
}

export async function getActivity(): Promise<{ events: ActivityEvent[]; count: number }> {
  const { data } = await api.get('/notifications/activity')
  return data
}

export async function getSmartAlerts(): Promise<{ alerts: SmartAlert[]; count: number }> {
  const { data } = await api.get('/notifications/smart')
  return data
}

export async function getNotifications(params?: { unreadOnly?: boolean }): Promise<{
  notifications: Notification[]
  unreadCount: number
}> {
  const { data } = await api.get('/notifications', { params })
  return data
}

export async function markAsRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`)
}

export async function markAllAsRead(): Promise<void> {
  await api.patch('/notifications/read-all')
}

export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/notifications/${id}`)
}
