import { apiClient } from './client'

export interface NotificationLog {
  id: number
  candidateId: number
  type: string
  triggerEvent: string
  deliveryStatus: string
  recipient: string
  subject: string | null
  content: string
  sentAt: string | null
  errorMessage: string | null
  createdAt: string
}

export interface NotificationLogsResult {
  items: NotificationLog[]
  total: number
  page: number
  pageSize: number
}

export async function listNotificationLogs(params?: {
  candidateId?: number
  type?: string
  triggerEvent?: string
  deliveryStatus?: string
  page?: number
  pageSize?: number
}): Promise<NotificationLogsResult> {
  const res = await apiClient.get<NotificationLogsResult>('/notification-logs', { params })
  return res.data
}

export async function retryNotification(id: number): Promise<NotificationLog> {
  const res = await apiClient.post<{ log: NotificationLog }>(`/notification-logs/${id}/retry`)
  return res.data.log
}
