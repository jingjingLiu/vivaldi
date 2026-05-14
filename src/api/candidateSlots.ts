import { apiClient } from './client'

export interface AvailableSlot {
  id: number
  date: string
  startTime: string
  endTime: string
  interviewerName: string
}

export interface BookedSlot {
  id: number
  date: string
  startTime: string
  endTime: string
  interviewerName: string
}

interface SlotWithInterviewer {
  id: number
  date: string
  startTime: string
  endTime: string
  interviewer: { id: number; name: string }
}

function mapSlot(slot: SlotWithInterviewer): AvailableSlot {
  return {
    id: slot.id,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    interviewerName: slot.interviewer.name,
  }
}

export async function listAvailable(): Promise<AvailableSlot[]> {
  const res = await apiClient.get<{ slots: SlotWithInterviewer[] }>('/candidate/time-slots/available')
  return res.data.slots.map(mapSlot)
}

export async function book(slotId: number): Promise<BookedSlot> {
  const res = await apiClient.post<{ slot: SlotWithInterviewer }>(`/candidate/time-slots/${slotId}/book`)
  return mapSlot(res.data.slot)
}

export async function mine(): Promise<BookedSlot | null> {
  const res = await apiClient.get<{ slot: SlotWithInterviewer | null }>('/candidate/time-slots/mine')
  return res.data.slot ? mapSlot(res.data.slot) : null
}
