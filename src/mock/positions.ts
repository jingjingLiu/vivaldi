import type { Position } from '../types'

export const mockPositions: Position[] = [
  { id: '1', name: '前端工程师', interviewerIds: ['2', '3'], hasOaForm: true, candidateCount: 12 },
  { id: '2', name: '后端工程师', interviewerIds: ['3', '4', '5'], hasOaForm: true, candidateCount: 8 },
  { id: '3', name: '产品经理', interviewerIds: [], hasOaForm: false, candidateCount: 3 },
]
