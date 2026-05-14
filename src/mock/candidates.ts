import type { Candidate, OaSubmission, StatusHistoryEntry, InterviewEvaluation } from '../types'

export const mockCandidates: Candidate[] = [
  {
    id: '1', name: '陈明', gender: 'male', email: 'chen@mail.com', phone: '13812341234',
    positionId: '1', status: 'waiting_for_oa', oneTimeCode: 'A3X9K2',
    oaDeadline: '2026-04-19', resumeMarkdown: '# 陈明\n\n前端开发工程师 | 5年经验 | 上海\n\n---\n\n## 工作经历\n\n**ABC科技有限公司** — 高级前端工程师 (2023.03 - 至今)\n\n- 负责公司核心产品前端架构设计与开发\n- 使用 Vue 3 + TypeScript 重构了管理后台\n- 搭建了前端监控和性能优化体系\n\n## 教育背景\n\nXX大学 — 计算机科学与技术 — 本科 (2017 - 2021)',
    createdAt: '2026-04-10T15:20:00Z', updatedAt: '2026-04-12T10:30:00Z',
  },
  {
    id: '2', name: '刘洋', gender: 'male', email: 'liu@mail.com', phone: '13956781234',
    positionId: '2', status: 'oa_completed', oneTimeCode: 'B7Y2M5',
    oaDeadline: '2026-04-18', resumeMarkdown: '# 刘洋\n\n后端开发工程师 | 3年经验\n\n---\n\n## 工作经历\n\n**XYZ公司** — 后端工程师 (2023.06 - 至今)\n\n- 负责微服务架构设计\n- 使用 Node.js + TypeScript 开发 API',
    createdAt: '2026-04-08T09:00:00Z', updatedAt: '2026-04-11T14:00:00Z',
  },
  {
    id: '3', name: '赵薇', gender: 'female', email: 'zhao@mail.com', phone: '13790121234',
    positionId: '1', status: 'date_confirmed', oneTimeCode: 'C1K8P3',
    oaDeadline: null, resumeMarkdown: '# 赵薇\n\n前端工程师 | 4年经验',
    createdAt: '2026-04-05T10:00:00Z', updatedAt: '2026-04-10T16:00:00Z',
  },
  {
    id: '4', name: '孙鹏', gender: 'male', email: 'sun@mail.com', phone: '13634561234',
    positionId: '3', status: 'oa_no_response', oneTimeCode: 'D5N3Q7',
    oaDeadline: '2026-04-06', resumeMarkdown: null,
    createdAt: '2026-04-01T08:00:00Z', updatedAt: '2026-04-08T00:00:00Z',
  },
  {
    id: '5', name: '周婷', gender: 'female', email: 'zhou@mail.com', phone: '13578901234',
    positionId: '2', status: 'passed', oneTimeCode: 'E9R4W1',
    oaDeadline: null, resumeMarkdown: '# 周婷\n\n后端工程师 | 6年经验',
    createdAt: '2026-03-28T11:00:00Z', updatedAt: '2026-04-07T17:00:00Z',
  },
]

export const mockOaSubmissions: Record<string, OaSubmission> = {
  '2': {
    candidateId: '2',
    startedAt: '2026-04-13T14:00:00Z',
    submittedAt: '2026-04-13T14:52:00Z',
    totalMinutes: 60,
    answers: [
      { questionIndex: 0, questionText: '请描述你对前端性能优化的理解和实践经验', answerType: 'text', answer: '前端性能优化可以从以下几个维度入手：\n\n1. **网络层面**：使用CDN、启用HTTP/2、合理设置缓存策略\n2. **资源层面**：代码分割、Tree Shaking、图片懒加载\n3. **渲染层面**：减少重排重绘、使用虚拟列表' },
      { questionIndex: 1, questionText: '实现一个防抖函数 debounce', answerType: 'code', answer: 'function debounce(fn, delay) {\n  let timer = null;\n  return function(...args) {\n    clearTimeout(timer);\n    timer = setTimeout(() => {\n      fn.apply(this, args);\n    }, delay);\n  };\n}' },
      { questionIndex: 2, questionText: '描述 RESTful API 设计的最佳实践', answerType: 'text', answer: 'RESTful API 设计应遵循以下原则：\n\n- 使用名词复数作为资源路径\n- 正确使用 HTTP 方法\n- 使用合适的状态码\n- 版本控制' },
    ],
  },
}

export const mockStatusHistory: Record<string, StatusHistoryEntry[]> = {
  '1': [
    { status: 'waiting_for_oa', timestamp: '2026-04-12T10:30:00Z', operatorName: '张三', operatorRole: 'coordinator', note: '已发送OA通知邮件和短信' },
    { status: 'new', timestamp: '2026-04-10T15:20:00Z', operatorName: '张三', operatorRole: 'screener', note: '简历上传，信息自动提取完成' },
  ],
  '5': [
    { status: 'passed', timestamp: '2026-04-07T17:00:00Z', operatorName: '张三', operatorRole: 'coordinator', note: '面试通过，发放 offer' },
    { status: 'human_completed', timestamp: '2026-04-05T16:00:00Z', operatorName: '赵六', operatorRole: 'interviewer', note: '面试完成，表现优秀' },
    { status: 'date_confirmed', timestamp: '2026-04-02T10:00:00Z', operatorName: '系统', operatorRole: 'coordinator', note: '候选人已选择面试时间' },
    { status: 'oa_completed', timestamp: '2026-03-31T14:00:00Z', operatorName: '系统', operatorRole: 'coordinator', note: 'OA提交完成' },
    { status: 'waiting_for_oa', timestamp: '2026-03-29T09:00:00Z', operatorName: '张三', operatorRole: 'coordinator', note: '已发送OA通知' },
    { status: 'new', timestamp: '2026-03-28T11:00:00Z', operatorName: '张三', operatorRole: 'screener', note: '简历上传' },
  ],
}

export const mockEvaluations: Record<string, InterviewEvaluation> = {
  '5': {
    candidateId: '5',
    interviewerName: '赵六',
    result: 'passed',
    comment: '技术基础扎实，系统设计能力强，沟通表达清晰。建议录用。',
    timestamp: '2026-04-05T16:00:00Z',
  },
}
