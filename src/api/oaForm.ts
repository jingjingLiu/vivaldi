import { apiClient } from './client'

export interface OaQuestion {
  id: number
  questionText: string
  answerType: 'text' | 'code'
  sortOrder: number
}

export interface OaForm {
  id: number
  positionId: number
  timeLimitMinutes: number
  instructionEn: string | null
  instructionZh: string | null
  questions: OaQuestion[]
}

export async function getOaFormByPosition(positionId: number): Promise<OaForm | null> {
  const res = await apiClient.get<{ form: OaForm | null }>(`/positions/${positionId}/oa-form`)
  return res.data.form
}

export async function upsertOaForm(
  positionId: number,
  body: {
    timeLimitMinutes: number
    instructionEn?: string
    instructionZh?: string
    questions: { questionText: string; answerType: 'text' | 'code'; sortOrder: number }[]
  },
): Promise<OaForm> {
  const res = await apiClient.put<{ form: OaForm }>(`/positions/${positionId}/oa-form`, body)
  return res.data.form
}

export async function deleteOaForm(positionId: number): Promise<void> {
  await apiClient.delete(`/positions/${positionId}/oa-form`)
}
