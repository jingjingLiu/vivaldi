export type Role = 'coordinator' | 'screener' | 'interviewer'

export interface User {
  id: string
  username: string
  name: string
  roles: Role[]
  enabled: boolean
}

export type CandidateMainStatus = 'new' | 'oa' | 'human' | 'failed' | 'passed'

export type CandidateSubStatus =
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
  id: string
  name: string
  gender: 'male' | 'female'
  email: string
  phone: string
  positionId: string
  status: CandidateSubStatus
  oneTimeCode: string
  oaDeadline: string | null
  resumeMarkdown: string | null
  createdAt: string
  updatedAt: string
}

export interface OaAnswer {
  questionIndex: number
  questionText: string
  answerType: 'text' | 'code'
  answer: string
}

export interface OaSubmission {
  candidateId: string
  startedAt: string
  submittedAt: string | null
  totalMinutes: number
  answers: OaAnswer[]
}

export interface StatusHistoryEntry {
  status: CandidateSubStatus
  timestamp: string
  operatorName: string
  operatorRole: Role
  note: string
}

export interface InterviewEvaluation {
  candidateId: string
  interviewerName: string
  result: 'passed' | 'failed'
  comment: string
  timestamp: string
}

export interface Position {
  id: string
  name: string
  interviewerIds: string[]
  hasOaForm: boolean
  candidateCount: number
}

export interface TimeSlot {
  id: string
  interviewerId: string
  date: string
  startTime: string
  endTime: string
  candidateId: string | null
  candidateName: string | null
}

export interface SystemSettings {
  companyName: string
  baseUrl: string
  oaDeadlineDays: number
  smtp: {
    mode: 'smtp' | 'api'
    host: string
    port: number
    username: string
    password: string
    apiUrl: string
    apiAppCode: string
    apiAppSecret: string
  }
  sms: { apiUrl: string; apiKey: string; senderNumber: string }
}
