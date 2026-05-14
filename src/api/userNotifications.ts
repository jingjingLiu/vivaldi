import { apiClient } from './client'
import type { CandidateStatus } from './candidates'

export type UserNotificationEvent = 'oa_completed' | 'interview_booked'

export interface UserNotification {
  id: number
  userId: number
  candidateId: number | null
  event: UserNotificationEvent
  title: string
  content: string
  readAt: string | null
  createdAt: string
  candidate: {
    id: number
    name: string | null
    status: CandidateStatus
    positionName: string
  } | null
}

export interface UserNotificationsResult {
  items: UserNotification[]
  total: number
  page: number
  pageSize: number
}

export async function listUserNotifications(params?: {
  unreadOnly?: boolean
  page?: number
  pageSize?: number
}): Promise<UserNotificationsResult> {
  // The backend accepts unreadOnly as an explicit string to avoid Boolean query coercion surprises.
  const res = await apiClient.get<UserNotificationsResult>('/user-notifications', {
    params: {
      ...params,
      unreadOnly: params?.unreadOnly === undefined ? undefined : String(params.unreadOnly),
    },
  })
  return res.data
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiClient.get<{ count: number }>('/user-notifications/unread-count')
  return res.data.count
}

export async function markNotificationRead(id: number): Promise<UserNotification> {
  const res = await apiClient.post<{ notification: UserNotification }>(`/user-notifications/${id}/read`)
  return res.data.notification
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await apiClient.post<{ count: number }>('/user-notifications/read-all')
  return res.data.count
}
