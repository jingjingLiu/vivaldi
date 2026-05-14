import { apiClient } from './client'

export interface TimeSlot {
  id: number
  interviewerId: number
  date: string
  startTime: string
  endTime: string
  candidateId: number | null
  candidateName: string | null
  positionName: string | null
}

export async function listMySlots(params?: { from?: string; to?: string }): Promise<TimeSlot[]> {
  const res = await apiClient.get<{ slots: TimeSlot[] }>('/time-slots/mine', { params })
  return res.data.slots
}

export async function listAvailableSlots(params?: { positionId?: number }): Promise<TimeSlot[]> {
  const res = await apiClient.get<{ slots: TimeSlot[] }>('/time-slots/available', { params })
  return res.data.slots
}

export async function createSlot(body: {
  date: string
  startTime: string
  endTime: string
}): Promise<TimeSlot> {
  const res = await apiClient.post<{ slot: TimeSlot }>('/time-slots', body)
  return res.data.slot
}

export async function updateSlot(
  id: number,
  body: { date?: string; startTime?: string; endTime?: string },
): Promise<TimeSlot> {
  const res = await apiClient.patch<{ slot: TimeSlot }>(`/time-slots/${id}`, body)
  return res.data.slot
}

export async function deleteSlot(id: number): Promise<void> {
  await apiClient.delete(`/time-slots/${id}`)
}
