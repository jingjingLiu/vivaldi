import { apiClient } from './client'

export type Role = 'coordinator' | 'screener' | 'interviewer'

export interface User {
  id: number
  username: string
  name: string
  roles: Role[]
  enabled: boolean
  locale?: string
}

export interface UserListResult {
  items: User[]
  total: number
  page: number
  pageSize: number
}

export async function listUsers(params?: {
  q?: string
  role?: Role
  page?: number
  pageSize?: number
}): Promise<UserListResult> {
  const res = await apiClient.get<UserListResult>('/users', { params })
  return res.data
}

export async function getUser(id: number): Promise<User> {
  const res = await apiClient.get<{ user: User }>(`/users/${id}`)
  return res.data.user
}

export async function createUser(body: {
  username: string
  password: string
  name: string
  roles: Role[]
  locale?: string
}): Promise<User> {
  const res = await apiClient.post<{ user: User }>('/users', body)
  return res.data.user
}

export async function updateUser(
  id: number,
  body: { name?: string; enabled?: boolean; roles?: Role[]; locale?: string },
): Promise<User> {
  const res = await apiClient.patch<{ user: User }>(`/users/${id}`, body)
  return res.data.user
}

export async function resetPassword(id: number, password: string): Promise<void> {
  await apiClient.post(`/users/${id}/password`, { password })
}
