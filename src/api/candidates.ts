import { apiClient } from './client'

export type CandidateStatus =
  | 'new'
  | 'waiting_for_oa'
  | 'oa_completed'
  | 'wait_to_confirm_date'
  | 'date_confirmed'
  | 'human_completed'
  | 'oa_failed'
  | 'oa_no_response'
  | 'give_up_for_human'
  | 'rejected'
  | 'passed'

export interface Candidate {
  id: number
  name: string | null
  gender?: 'male' | 'female' | null
  email: string | null
  phone?: string | null
  phoneMasked?: string | null
  positionId: number
  positionName?: string
  status: CandidateStatus
  oneTimeCode?: string
  oaDeadline?: string | null
  resumeMarkdown?: string | null
  createdAt: string
  updatedAt: string
  viewerCanEvaluate?: boolean
}

export interface CandidateListResult {
  items: Candidate[]
  total: number
  page: number
  pageSize: number
}

export interface StatusHistoryEntry {
  fromStatus: CandidateStatus | null
  toStatus: CandidateStatus
  operatorId: number | null
  operatorName: string | null
  createdAt: string
  note: string | null
}

export interface Evaluation {
  id: number
  result: 'passed' | 'failed'
  comment: string | null
  createdAt: string
  interviewer: {
    id: number
    name: string
  }
}

export interface OaAnswer {
  questionId: number
  questionText: string
  answerType: 'text' | 'code'
  answerContent: string
  sortOrder: number
}

export interface OaAnswersResult {
  submission: {
    startedAt: string
    submittedAt: string | null
    autoSubmitted: boolean
  } | null
  answers: OaAnswer[]
  // The backend exposes the configured OA limit at the response top level.
  timeLimitMinutes: number | null
}

export async function listCandidates(params?: {
  q?: string
  status?: CandidateStatus
  positionId?: number
  page?: number
  pageSize?: number
}): Promise<CandidateListResult> {
  const res = await apiClient.get<CandidateListResult>('/candidates', { params })
  return res.data
}

export async function getCandidate(id: number): Promise<Candidate> {
  const res = await apiClient.get<{ candidate: Candidate }>(`/candidates/${id}`)
  return res.data.candidate
}

export async function uploadResume(
  file: File,
  positionId: number,
): Promise<Candidate> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('positionId', String(positionId))
  const res = await apiClient.post<{ candidate: Candidate }>('/candidates/upload-resume', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.candidate
}

export async function updateCandidate(
  id: number,
  body: Partial<Pick<Candidate, 'name' | 'gender' | 'email' | 'phone' | 'resumeMarkdown'>>,
): Promise<Candidate> {
  const res = await apiClient.patch<{ candidate: Candidate }>(`/candidates/${id}`, body)
  return res.data.candidate
}

// Candidate deletion is confirmed in the list UI; the backend returns 204 with no body.
export async function deleteCandidate(id: number): Promise<void> {
  await apiClient.delete(`/candidates/${id}`)
}

export async function getResumeFileUrl(id: number): Promise<string> {
  // Returns a temporary blob URL for the resume file
  const res = await apiClient.get(`/candidates/${id}/resume-file`, { responseType: 'blob' })
  return URL.createObjectURL(res.data as Blob)
}

export async function changeStatus(
  id: number,
  toStatus: CandidateStatus,
  note?: string,
): Promise<Candidate> {
  const res = await apiClient.post<{ candidate: Candidate }>(`/candidates/${id}/status`, {
    toStatus,
    note,
  })
  return res.data.candidate
}

export async function getStatusHistory(id: number): Promise<StatusHistoryEntry[]> {
  const res = await apiClient.get<{ history: StatusHistoryEntry[] }>(`/candidates/${id}/status-history`)
  return res.data.history
}

export async function listEvaluations(id: number): Promise<Evaluation[]> {
  const res = await apiClient.get<{ evaluations: Evaluation[] }>(`/candidates/${id}/evaluations`)
  return res.data.evaluations
}

export async function getOaAnswers(id: number): Promise<OaAnswersResult> {
  const res = await apiClient.get<OaAnswersResult>(`/candidates/${id}/oa-answers`)
  return res.data
}

export async function submitEvaluation(
  candidateId: number,
  body: { result: 'passed' | 'failed'; comment?: string },
): Promise<Evaluation> {
  const res = await apiClient.post<{ evaluation: Evaluation }>(
    `/candidates/${candidateId}/evaluations`,
    body,
  )
  return res.data.evaluation
}
