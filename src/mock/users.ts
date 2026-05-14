import type { User } from '../types'

export const mockUsers: User[] = [
  { id: '1', username: 'admin', name: '张三', roles: ['coordinator', 'screener'], enabled: true },
  { id: '2', username: 'lisi', name: '李四', roles: ['interviewer'], enabled: true },
  { id: '3', username: 'wangwu', name: '王五', roles: ['interviewer', 'screener'], enabled: false },
  { id: '4', username: 'zhaoliu', name: '赵六', roles: ['interviewer'], enabled: true },
  { id: '5', username: 'qianqi', name: '钱七', roles: ['interviewer'], enabled: true },
]
