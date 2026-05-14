import type { TimeSlot } from '../types'

export const mockTimeSlots: TimeSlot[] = [
  { id: '1', interviewerId: '2', date: '2026-04-13', startTime: '09:00', endTime: '10:00', candidateId: '1', candidateName: '陈明' },
  { id: '2', interviewerId: '2', date: '2026-04-13', startTime: '10:00', endTime: '11:00', candidateId: null, candidateName: null },
  { id: '3', interviewerId: '2', date: '2026-04-14', startTime: '09:00', endTime: '10:00', candidateId: null, candidateName: null },
  { id: '4', interviewerId: '2', date: '2026-04-14', startTime: '13:00', endTime: '14:00', candidateId: null, candidateName: null },
  { id: '5', interviewerId: '2', date: '2026-04-15', startTime: '10:00', endTime: '11:30', candidateId: null, candidateName: null },
  { id: '6', interviewerId: '2', date: '2026-04-15', startTime: '14:00', endTime: '15:00', candidateId: '3', candidateName: '赵薇' },
  { id: '7', interviewerId: '2', date: '2026-04-16', startTime: '09:00', endTime: '10:00', candidateId: null, candidateName: null },
  { id: '8', interviewerId: '2', date: '2026-04-16', startTime: '13:00', endTime: '14:30', candidateId: null, candidateName: null },
  { id: '9', interviewerId: '2', date: '2026-04-17', startTime: '10:00', endTime: '11:00', candidateId: '2', candidateName: '刘洋' },
  { id: '10', interviewerId: '2', date: '2026-04-17', startTime: '15:00', endTime: '16:00', candidateId: null, candidateName: null },
]
