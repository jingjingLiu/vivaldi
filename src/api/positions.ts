import { apiClient } from './client'

export interface PositionInterviewer {
  id: number
  username: string
  name: string
}

export interface PositionListItem {
  id: number
  name: string
  candidateCount: number
  hasOaForm: boolean
  interviewerCount: number
  createdAt: string
}

export interface PositionDetail {
  id: number
  name: string
  candidateCount: number
  hasOaForm: boolean
  interviewers: PositionInterviewer[]
  createdAt: string
  updatedAt: string
}

export interface PositionListResult {
  items: PositionListItem[]
  total: number
  page: number
  pageSize: number
}

export async function listPositions(params?: {
  q?: string
  page?: number
  pageSize?: number
}): Promise<PositionListResult> {
  const res = await apiClient.get<PositionListResult>('/positions', { params })
  return res.data
}

export async function getPosition(id: number): Promise<PositionDetail> {
  const res = await apiClient.get<{ position: PositionDetail }>(`/positions/${id}`)
  return res.data.position
}

export async function createPosition(body: {
  name: string
  interviewerIds?: number[]
}): Promise<PositionDetail> {
  const res = await apiClient.post<{ position: PositionDetail }>('/positions', body)
  return res.data.position
}

export async function updatePosition(
  id: number,
  body: { name?: string; interviewerIds?: number[] },
): Promise<PositionDetail> {
  const res = await apiClient.patch<{ position: PositionDetail }>(`/positions/${id}`, body)
  return res.data.position
}

export async function deletePosition(id: number): Promise<void> {
  await apiClient.delete(`/positions/${id}`)
}
