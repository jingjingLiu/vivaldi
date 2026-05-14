import { apiClient } from './client'

export type OaApiState = 'not_started' | 'in_progress' | 'submitted'

export interface OaStateResponse {
  state: OaApiState
  instructions: { en: string | null; zhCN: string | null }
  timeLimitMinutes: number
  questionCount: number
  startedAt?: string | null
  remainingSeconds?: number | null
}

export interface OaQuestion {
  id: number
  sortOrder: number
  questionText: string
  answerType: 'text' | 'code'
  answerContent: string | null
}

export interface StartOaResult {
  startedAt: string
  remainingSeconds: number
}

export interface SubmitOaResult {
  submittedAt: string
  autoSubmitted: boolean
}

export async function getState(): Promise<OaStateResponse> {
  const res = await apiClient.get<OaStateResponse>('/oa')
  return res.data
}

export async function start(): Promise<StartOaResult> {
  const res = await apiClient.post<StartOaResult>('/oa/start')
  return res.data
}

export async function questions(): Promise<OaQuestion[]> {
  const res = await apiClient.get<{ questions: OaQuestion[] }>('/oa/questions')
  return res.data.questions
}

export async function saveAnswer(
  questionId: number,
  answerContent: string,
): Promise<{ ok: boolean; updatedAt: string }> {
  const res = await apiClient.put<{ ok: boolean; updatedAt: string }>(
    `/oa/answers/${questionId}`,
    { answerContent },
  )
  return res.data
}

export async function submit(): Promise<SubmitOaResult> {
  const res = await apiClient.post<SubmitOaResult>('/oa/submit')
  return res.data
}
