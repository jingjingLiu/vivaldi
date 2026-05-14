import { apiClient } from './client'

export interface AuthPrincipal {
  userId: number
  roles: string[]
  kind: 'internal' | 'candidate'
}

export async function login(username: string, password: string): Promise<AuthPrincipal> {
  const res = await apiClient.post<{ user: AuthPrincipal }>('/auth/login', { username, password })
  return res.data.user
}

export async function candidateLogin(oneTimeCode: string, phoneLast4: string): Promise<AuthPrincipal> {
  const res = await apiClient.post<{ user: AuthPrincipal }>('/auth/candidate-login', {
    oneTimeCode,
    phoneLast4,
  })
  return res.data.user
}

export async function me(): Promise<AuthPrincipal> {
  const res = await apiClient.get<{ user: AuthPrincipal }>('/auth/me')
  return res.data.user
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}
