import { apiClient } from './client'
import type { CandidateStatus } from './candidates'

export interface CandidateProfile {
  id: number
  name: string | null
  email: string | null
  phone: string | null
  positionId: number
  positionName: string
  status: CandidateStatus
  oaDeadline: string | null
  oneTimeCode: string
}

export async function getProfile(): Promise<CandidateProfile> {
  const res = await apiClient.get<{ candidate: CandidateProfile }>('/candidate/profile')
  return res.data.candidate
}
