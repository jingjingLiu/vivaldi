import { apiClient } from './client'

export interface SystemSettings {
  companyName: string
  baseUrl: string
  oaDeadlineDays: number
  smtp: {
    mode: 'smtp' | 'api'
    host: string
    port: number
    username: string
    password: string
    apiUrl: string
    apiAppCode: string
    apiAppSecret: string
  }
  sms: { apiUrl: string; apiKey: string; senderNumber: string }
}

export type SettingsPatch = Partial<{
  companyName: string
  baseUrl: string
  oaDeadlineDays: number
  smtp: Partial<SystemSettings['smtp']>
  sms: Partial<SystemSettings['sms']>
}>

export async function getSettings(): Promise<SystemSettings> {
  const res = await apiClient.get<{ settings: SystemSettings }>('/settings')
  return res.data.settings
}

export async function updateSettings(patch: SettingsPatch): Promise<SystemSettings> {
  const res = await apiClient.put<{ settings: SystemSettings }>('/settings', patch)
  return res.data.settings
}
