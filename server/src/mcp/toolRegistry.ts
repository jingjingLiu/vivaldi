import { CandidateStatus, DeliveryStatus, NotificationType, Role, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../errors/HttpError.js';
import type { AuthPrincipal } from '../types/express.d.js';
import { listUsers } from '../services/userService.js';
import { listPositions, getPositionById } from '../services/positionService.js';
import { getSettings } from '../services/settingService.js';
import { uploadResume, getCandidateById, updateCandidateInfo } from '../services/candidateService.js';
import { changeStatus, listStatusHistory } from '../services/statusService.js';
import { getOaAnswers, listEvaluations, createEvaluation } from '../services/evaluationService.js';
import { createSlot, listAvailableSlots, listMySlots, updateSlot } from '../services/timeSlotService.js';
import { retrySendLog } from '../services/notificationService.js';

// MCP 输入 Schema 使用标准 JSON Schema，方便任意 MCP Client 展示参数表单。
type JsonSchema = Record<string, unknown>;

// MCP 工具运行上下文保存当前连接的 Server 和员工身份。
export interface McpToolContext {
  serverId: string;
  principal: AuthPrincipal;
}

// 每个 MCP 工具都包含展示给 Agent 的元数据和实际执行业务逻辑。
export interface McpTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  run: (context: McpToolContext, input: unknown) => Promise<unknown>;
}

// Server 配置把 Server ID、允许角色和工具清单绑定在一起。
export interface McpServerDefinition {
  serverId: string;
  requiredRole: Role;
  description: string;
  tools: McpTool[];
}

// 列表类工具最多返回 10 条，避免 Agent 一次拉取过多业务数据。
const MAX_LIST_LIMIT = 10;

// 日期字符串校验保持与现有 REST API 一致。
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

// 时间字符串校验保持与现有 REST API 一致。
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:MM');

// 通用列表参数只允许 1 到 10 条，默认返回 10 条。
const listLimitSchema = z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).optional();

// 候选人搜索参数被多个角色复用。
const candidateSearchSchema = z.object({
  q: z.string().trim().min(1).optional(),
  position_id: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(CandidateStatus).optional(),
  limit: listLimitSchema,
});

// 候选人详情参数支持按需包含长文本和历史记录。
const candidateDetailSchema = z.object({
  candidate_id: z.coerce.number().int().positive(),
  include_resume_markdown: z.boolean().optional(),
  include_status_history: z.boolean().optional(),
  include_candidate_login_code: z.boolean().optional(),
});

// 候选人状态历史参数。
const candidateIdSchema = z.object({
  candidate_id: z.coerce.number().int().positive(),
  limit: listLimitSchema,
});

// 简历上传参数使用 Base64，适合 MCP JSON-RPC 传输。
const uploadResumeSchema = z.object({
  position_id: z.coerce.number().int().positive(),
  file_name: z.string().min(1).max(255),
  file_mime_type: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]),
  file_base64: z.string().min(1),
});

// 候选人资料修正参数要求提供原因，便于 Agent 在回复里保留人工意图。
const updateCandidateProfileSchema = z.object({
  candidate_id: z.coerce.number().int().positive(),
  name: z.string().min(1).max(100).optional(),
  gender: z.enum(['male', 'female']).optional(),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+?[0-9]{7,20}$/).optional(),
  resume_markdown: z.string().max(50000).optional(),
  reason: z.string().min(1).max(1000),
});

// 筛简决策只允许通过到 OA 或筛简拒绝。
const screeningDecisionSchema = z.object({
  candidate_id: z.coerce.number().int().positive(),
  decision: z.enum(['pass_to_oa', 'reject']),
  note: z.string().max(1000).optional(),
});

// 协调者状态推进使用完整状态机枚举，由现有服务继续做状态机校验。
const changeCandidateStatusSchema = z.object({
  candidate_id: z.coerce.number().int().positive(),
  to_status: z.nativeEnum(CandidateStatus),
  note: z.string().max(1000).optional(),
});

// 面试评估参数复用现有服务约束。
const interviewEvaluationSchema = z.object({
  candidate_id: z.coerce.number().int().positive(),
  result: z.enum(['passed', 'failed']),
  comment: z.string().max(5000).optional(),
});

// 面试官时段查询参数。
const mySlotsSchema = z.object({
  date_from: dateSchema.optional(),
  date_to: dateSchema.optional(),
  limit: listLimitSchema,
});

// 面试官创建时段参数。
const createTimeSlotSchema = z.object({
  date: dateSchema,
  start_time: timeSchema,
  end_time: timeSchema,
});

// 面试官更新时段参数至少包含一个可更新字段。
const updateTimeSlotSchema = z
  .object({
    time_slot_id: z.coerce.number().int().positive(),
    date: dateSchema.optional(),
    start_time: timeSchema.optional(),
    end_time: timeSchema.optional(),
    reason: z.string().min(1).max(1000),
  })
  .refine((v) => v.date !== undefined || v.start_time !== undefined || v.end_time !== undefined, {
    message: 'date, start_time or end_time is required',
  });

// 员工列表查询参数。
const listUsersSchema = z.object({
  q: z.string().trim().min(1).optional(),
  role: z.nativeEnum(Role).optional(),
  limit: listLimitSchema,
});

// 岗位列表查询参数。
const listPositionsSchema = z.object({
  q: z.string().trim().min(1).optional(),
  limit: listLimitSchema,
});

// 岗位详情查询参数。
const positionIdSchema = z.object({
  position_id: z.coerce.number().int().positive(),
});

// 可用时段查询参数。
const availableSlotsSchema = z.object({
  position_id: z.coerce.number().int().positive().optional(),
  limit: listLimitSchema,
});

// 通知日志查询参数。
const notificationLogSearchSchema = z.object({
  candidate_id: z.coerce.number().int().positive().optional(),
  type: z.nativeEnum(NotificationType).optional(),
  trigger_event: z.string().trim().min(1).optional(),
  delivery_status: z.nativeEnum(DeliveryStatus).optional(),
  limit: listLimitSchema,
});

// 通知重试参数。
const retryNotificationSchema = z.object({
  notification_log_id: z.coerce.number().int().positive(),
});

// JSON Schema 片段用于降低工具定义重复。
const positiveNumberSchema = { type: 'number', minimum: 1 };

// JSON Schema 片段用于限制列表返回量。
const limitJsonSchema = { type: 'number', minimum: 1, maximum: MAX_LIST_LIMIT, default: MAX_LIST_LIMIT };

// 候选人状态枚举给 Agent 明确可选值。
const candidateStatusJsonSchema = { type: 'string', enum: Object.values(CandidateStatus) };

// 角色枚举给 Agent 明确可选值。
const roleJsonSchema = { type: 'string', enum: Object.values(Role) };

// 日期和时间 JSON Schema 复用描述。
const dateJsonSchema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const timeJsonSchema = { type: 'string', pattern: '^\\d{2}:\\d{2}$' };

// 构造 JSON Schema 对象，避免每个工具重复书写 required。
function objectSchema(properties: JsonSchema, required: string[] = []): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };
}

// 统一解析 Zod 入参，错误会转成 MCP 友好的结构化错误。
function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'MCP tool arguments are invalid', {
      messageKey: 'errors.validation_error',
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

// MCP 不直接返回完整手机号给面试官，避免越权暴露候选人联系方式。
function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 4) return '***';
  return `***${phone.slice(-4)}`;
}

// 列表返回结构统一带 has_more，帮助 Agent 主动缩小查询条件。
function toListResult<T>(items: T[], limit: number): {
  items: T[];
  returned_count: number;
  has_more: boolean;
  more_message: string | null;
} {
  const hasMore = items.length > limit;
  return {
    items: items.slice(0, limit),
    returned_count: Math.min(items.length, limit),
    has_more: hasMore,
    more_message: hasMore ? '查询结果超过返回上限，请增加姓名、岗位、状态或日期范围后重新查询。' : null,
  };
}

// 按当前 MCP Server 的角色要求校验用户身份。
export function assertServerAccess(definition: McpServerDefinition, principal: AuthPrincipal): void {
  if (principal.kind !== 'internal') {
    throw new HttpError(403, 'FORBIDDEN', 'MCP only accepts internal employee accounts', {
      messageKey: 'errors.forbidden',
    });
  }
  if (!principal.roles.includes(definition.requiredRole)) {
    throw new HttpError(403, 'FORBIDDEN', 'Current employee role cannot access this MCP server', {
      messageKey: 'errors.forbidden',
      requiredRole: definition.requiredRole,
      currentRoles: principal.roles,
    });
  }
}

// 面试官只能访问被指派岗位下的候选人。
async function assertCandidateVisible(context: McpToolContext, candidateId: number): Promise<void> {
  if (!context.serverId.startsWith('vivaldi.interviewer.')) return;
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { positionId: true } });
  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${candidateId} not found`, {
      messageKey: 'errors.not_found',
    });
  }
  const assignment = await prisma.positionInterviewer.findUnique({
    where: { positionId_userId: { positionId: candidate.positionId, userId: context.principal.userId } },
  });
  if (!assignment) {
    throw new HttpError(403, 'OUT_OF_SCOPE', 'Candidate is outside current interviewer scope', {
      messageKey: 'errors.out_of_scope',
    });
  }
}

// 根据角色构造候选人查询范围；现有数据模型尚无筛选员岗位绑定，因此筛选员沿用系统现有可见范围。
function buildCandidateWhere(context: McpToolContext, input: z.infer<typeof candidateSearchSchema>): Prisma.CandidateWhereInput {
  const where: Prisma.CandidateWhereInput = {};
  if (input.q) {
    where.OR = [
      { name: { contains: input.q } },
      { email: { contains: input.q } },
      { phone: { contains: input.q } },
    ];
  }
  if (input.position_id !== undefined) where.positionId = input.position_id;
  if (input.status !== undefined) where.status = input.status;
  if (context.serverId.startsWith('vivaldi.interviewer.')) {
    where.position = { interviewers: { some: { userId: context.principal.userId } } };
  }
  return where;
}

// 候选人摘要使用 snake_case 字段，降低 Agent 和 MCP 文档之间的映射成本。
function serializeCandidateSummary(candidate: {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  positionId: number;
  status: CandidateStatus;
  createdAt: Date;
  updatedAt: Date;
  position: { name: string };
}): Record<string, unknown> {
  return {
    candidate_id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    phone_masked: maskPhone(candidate.phone),
    position_id: candidate.positionId,
    position_name: candidate.position.name,
    status: candidate.status,
    created_at: candidate.createdAt,
    updated_at: candidate.updatedAt,
  };
}

// 候选人详情会根据角色和参数裁剪敏感字段。
async function loadCandidateDetail(
  context: McpToolContext,
  input: z.infer<typeof candidateDetailSchema>,
): Promise<Record<string, unknown>> {
  await assertCandidateVisible(context, input.candidate_id);
  const candidate = await getCandidateById(input.candidate_id, context.principal);
  const canSeeSensitive = context.principal.roles.includes('coordinator') || context.principal.roles.includes('screener');
  return {
    candidate_id: candidate.id,
    name: candidate.name,
    gender: candidate.gender,
    email: candidate.email,
    phone: canSeeSensitive ? candidate.phone : undefined,
    phone_masked: candidate.phoneMasked,
    position_id: candidate.positionId,
    position_name: candidate.positionName,
    status: candidate.status,
    oa_deadline: candidate.oaDeadline,
    resume_markdown: input.include_resume_markdown === false ? undefined : candidate.resumeMarkdown,
    one_time_code:
      context.principal.roles.includes('coordinator') && input.include_candidate_login_code === true
        ? candidate.oneTimeCode
        : undefined,
    resume_file: candidate.resumeFile,
    status_history: input.include_status_history === false ? undefined : candidate.statusHistory,
    created_at: candidate.createdAt,
    updated_at: candidate.updatedAt,
  };
}

// 搜索候选人并统一返回最多 10 条。
async function searchCandidates(context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(candidateSearchSchema, input);
  const limit = args.limit ?? MAX_LIST_LIMIT;
  const candidates = await prisma.candidate.findMany({
    where: buildCandidateWhere(context, args),
    include: { position: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: limit + 1,
  });
  return toListResult(candidates.map(serializeCandidateSummary), limit);
}

// 查询状态历史并统一裁剪数量。
async function listHistory(context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(candidateIdSchema, input);
  await assertCandidateVisible(context, args.candidate_id);
  const limit = args.limit ?? MAX_LIST_LIMIT;
  const history = await listStatusHistory(args.candidate_id);
  return toListResult(history, limit);
}

// 上传简历时复用现有简历转换、字段提取和候选人创建逻辑。
async function uploadCandidateResume(_context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(uploadResumeSchema, input);
  const buffer = Buffer.from(args.file_base64, 'base64');
  const result = await uploadResume({
    buffer,
    originalFilename: args.file_name,
    mimeType: args.file_mime_type,
    fileSize: buffer.byteLength,
    positionId: args.position_id,
  });
  return {
    candidate: result.candidate,
    resume_file: result.resumeFile,
  };
}

// 修正候选人资料时复用现有更新逻辑，reason 由 Agent 留在对话确认中。
async function updateCandidateProfile(_context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(updateCandidateProfileSchema, input);
  const candidate = await updateCandidateInfo(args.candidate_id, {
    name: args.name,
    gender: args.gender,
    email: args.email,
    phone: args.phone,
    resumeMarkdown: args.resume_markdown,
  });
  return { candidate };
}

// 筛简决策只允许 new -> waiting_for_oa 或 new -> rejected。
async function makeScreeningDecision(context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(screeningDecisionSchema, input);
  const toStatus = args.decision === 'pass_to_oa' ? CandidateStatus.waiting_for_oa : CandidateStatus.rejected;
  await changeStatus(args.candidate_id, toStatus, context.principal.userId, args.note);
  const candidate = await getCandidateById(args.candidate_id, context.principal);
  return { candidate };
}

// 协调者状态推进复用现有状态机和通知副作用。
async function changeCandidateStatus(context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(changeCandidateStatusSchema, input);
  await changeStatus(args.candidate_id, args.to_status, context.principal.userId, args.note);
  const candidate = await getCandidateById(args.candidate_id, context.principal);
  return { candidate };
}

// 查询 OA 答卷前先做面试官数据范围校验。
async function getCandidateOaSubmission(context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(candidateIdSchema, input);
  await assertCandidateVisible(context, args.candidate_id);
  return { oa_submission: await getOaAnswers(args.candidate_id) };
}

// 查询评估历史前先做面试官数据范围校验。
async function listCandidateEvaluations(context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(candidateIdSchema, input);
  await assertCandidateVisible(context, args.candidate_id);
  const limit = args.limit ?? MAX_LIST_LIMIT;
  const evaluations = await listEvaluations(args.candidate_id);
  return toListResult(evaluations, limit);
}

// 面试官提交评估会推进最终状态，必须由 Skill 在调用前做二次确认。
async function submitInterviewEvaluation(context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(interviewEvaluationSchema, input);
  await assertCandidateVisible(context, args.candidate_id);
  const evaluation = await createEvaluation(context.principal.userId, args.candidate_id, {
    result: args.result,
    comment: args.comment,
  });
  const candidate = await getCandidateById(args.candidate_id, context.principal);
  return { evaluation, candidate };
}

// 查询当前面试官自己的时段。
async function listMyTimeSlots(context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(mySlotsSchema, input);
  const limit = args.limit ?? MAX_LIST_LIMIT;
  const slots = await listMySlots(context.principal.userId, args.date_from, args.date_to);
  return toListResult(slots, limit);
}

// 创建当前面试官自己的可预约时段。
async function createTimeSlot(context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(createTimeSlotSchema, input);
  const timeSlot = await createSlot(context.principal.userId, {
    date: args.date,
    startTime: args.start_time,
    endTime: args.end_time,
  });
  return { time_slot: timeSlot };
}

// 修改当前面试官自己的未预约时段。
async function updateTimeSlot(context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(updateTimeSlotSchema, input);
  const timeSlot = await updateSlot(context.principal.userId, args.time_slot_id, {
    date: args.date,
    startTime: args.start_time,
    endTime: args.end_time,
  });
  return { time_slot: timeSlot };
}

// 查询系统员工列表，只向协调者开放。
async function listOrganizationUsers(_context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(listUsersSchema, input);
  const limit = args.limit ?? MAX_LIST_LIMIT;
  const result = await listUsers({ q: args.q, role: args.role, page: 1, pageSize: limit + 1 });
  return toListResult(result.items, limit);
}

// 查询岗位列表，只向协调者开放。
async function listOrganizationPositions(_context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(listPositionsSchema, input);
  const limit = args.limit ?? MAX_LIST_LIMIT;
  const result = await listPositions({ q: args.q, page: 1, pageSize: limit + 1 });
  return toListResult(result.items, limit);
}

// 查询岗位详情，只向协调者开放。
async function getOrganizationPosition(_context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(positionIdSchema, input);
  return { position: await getPositionById(args.position_id) };
}

// 查询候选人可预约时段，协调者用于排期检查。
async function listAvailableTimeSlots(_context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(availableSlotsSchema, input);
  const limit = args.limit ?? MAX_LIST_LIMIT;
  const slots = await listAvailableSlots(args.position_id);
  return toListResult(slots, limit);
}

// 查询系统参数时遮蔽所有密钥和密码字段。
async function getMaskedSystemSettings(): Promise<unknown> {
  const settings = await getSettings();
  return {
    company_name: settings.companyName,
    base_url: settings.baseUrl,
    oa_deadline_days: settings.oaDeadlineDays,
    smtp: {
      mode: settings.smtp.mode,
      host: settings.smtp.host,
      port: settings.smtp.port,
      username: settings.smtp.username,
      password: settings.smtp.password ? '******' : '',
      api_url: settings.smtp.apiUrl,
      api_app_code: settings.smtp.apiAppCode ? '******' : '',
      api_app_secret: settings.smtp.apiAppSecret ? '******' : '',
    },
    sms: {
      api_url: settings.sms.apiUrl,
      api_key: settings.sms.apiKey ? '******' : '',
      sender_number: settings.sms.senderNumber,
    },
  };
}

// 查询通知日志，限制最多返回 10 条。
async function listNotificationLogs(_context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(notificationLogSearchSchema, input);
  const limit = args.limit ?? MAX_LIST_LIMIT;
  const where: Prisma.NotificationLogWhereInput = {};
  if (args.candidate_id !== undefined) where.candidateId = args.candidate_id;
  if (args.type !== undefined) where.type = args.type;
  if (args.trigger_event !== undefined) where.triggerEvent = args.trigger_event;
  if (args.delivery_status !== undefined) where.deliveryStatus = args.delivery_status;
  const logs = await prisma.notificationLog.findMany({
    where,
    orderBy: { id: 'desc' },
    take: limit + 1,
  });
  return toListResult(logs, limit);
}

// 重试失败通知，实际发送结果由现有通知服务负责。
async function retryNotificationLog(_context: McpToolContext, input: unknown): Promise<unknown> {
  const args = parseInput(retryNotificationSchema, input);
  return { notification_log: await retrySendLog(args.notification_log_id) };
}

// 候选人查询工具定义。
const searchCandidatesTool = (name: string, description: string): McpTool => ({
  name,
  description,
  inputSchema: objectSchema({
    q: { type: 'string', description: '姓名、邮箱或手机号关键词' },
    position_id: positiveNumberSchema,
    status: candidateStatusJsonSchema,
    limit: limitJsonSchema,
  }),
  run: searchCandidates,
});

// 候选人详情工具定义。
const getCandidateTool = (name: string, description: string): McpTool => ({
  name,
  description,
  inputSchema: objectSchema(
    {
      candidate_id: positiveNumberSchema,
      include_resume_markdown: { type: 'boolean', default: true },
      include_status_history: { type: 'boolean', default: true },
      include_candidate_login_code: { type: 'boolean', default: false },
    },
    ['candidate_id'],
  ),
  run: async (context, input) => ({ candidate: await loadCandidateDetail(context, parseInput(candidateDetailSchema, input)) }),
});

// 候选人状态历史工具定义。
const listHistoryTool = (name: string, description: string): McpTool => ({
  name,
  description,
  inputSchema: objectSchema({ candidate_id: positiveNumberSchema, limit: limitJsonSchema }, ['candidate_id']),
  run: listHistory,
});

// OA 答卷工具定义。
const getOaSubmissionTool = (name: string, description: string): McpTool => ({
  name,
  description,
  inputSchema: objectSchema({ candidate_id: positiveNumberSchema }, ['candidate_id']),
  run: getCandidateOaSubmission,
});

// 评估历史工具定义。
const listEvaluationsTool = (name: string, description: string): McpTool => ({
  name,
  description,
  inputSchema: objectSchema({ candidate_id: positiveNumberSchema, limit: limitJsonSchema }, ['candidate_id']),
  run: listCandidateEvaluations,
});

// MCP Server 注册表是运行时暴露给 Agent 的唯一工具清单。
const serverDefinitions: McpServerDefinition[] = [
  {
    serverId: 'vivaldi.screener.candidates',
    requiredRole: Role.screener,
    description: '简历筛选人员使用：简历入库、候选人查看、筛简决策。',
    tools: [
      searchCandidatesTool('search_screening_candidates', '搜索当前筛选人员可处理的候选人，最多返回 10 条。'),
      getCandidateTool('get_screening_candidate', '获取筛简所需候选人详情、简历和状态历史。'),
      {
        name: 'upload_candidate_resume',
        description: '上传简历并创建候选人档案。',
        inputSchema: objectSchema(
          {
            position_id: positiveNumberSchema,
            file_name: { type: 'string' },
            file_mime_type: {
              type: 'string',
              enum: [
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain',
              ],
            },
            file_base64: { type: 'string' },
          },
          ['position_id', 'file_name', 'file_mime_type', 'file_base64'],
        ),
        run: uploadCandidateResume,
      },
      {
        name: 'update_screening_candidate_profile',
        description: '修正候选人基础信息或简历 Markdown。',
        inputSchema: objectSchema(
          {
            candidate_id: positiveNumberSchema,
            name: { type: 'string' },
            gender: { type: 'string', enum: ['male', 'female'] },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            resume_markdown: { type: 'string' },
            reason: { type: 'string' },
          },
          ['candidate_id', 'reason'],
        ),
        run: updateCandidateProfile,
      },
      {
        name: 'make_screening_decision',
        description: '对 new 状态候选人做筛简通过到 OA 或筛简拒绝。',
        inputSchema: objectSchema(
          {
            candidate_id: positiveNumberSchema,
            decision: { type: 'string', enum: ['pass_to_oa', 'reject'] },
            note: { type: 'string' },
          },
          ['candidate_id', 'decision'],
        ),
        run: makeScreeningDecision,
      },
      listHistoryTool('list_screening_status_history', '查询候选人状态历史。'),
    ],
  },
  {
    serverId: 'vivaldi.interviewer.review',
    requiredRole: Role.interviewer,
    description: '面试官使用：候选人审阅、OA 阅读、面试评估。',
    tools: [
      searchCandidatesTool('search_assigned_candidates', '搜索分配给当前面试官岗位下的候选人。'),
      getCandidateTool('get_assigned_candidate', '获取当前面试官可见的候选人详情。'),
      getOaSubmissionTool('get_assigned_candidate_oa_submission', '查看候选人 OA 答卷。'),
      listEvaluationsTool('list_candidate_evaluations', '查看候选人面试评估历史。'),
      {
        name: 'submit_interview_evaluation',
        description: '提交面试评估并推进候选人最终状态。',
        inputSchema: objectSchema(
          {
            candidate_id: positiveNumberSchema,
            result: { type: 'string', enum: ['passed', 'failed'] },
            comment: { type: 'string' },
          },
          ['candidate_id', 'result'],
        ),
        run: submitInterviewEvaluation,
      },
      listHistoryTool('list_assigned_candidate_status_history', '查看候选人状态历史。'),
    ],
  },
  {
    serverId: 'vivaldi.interviewer.schedule',
    requiredRole: Role.interviewer,
    description: '面试官使用：本人面试时段管理。',
    tools: [
      {
        name: 'list_my_time_slots',
        description: '查询当前面试官自己的面试时段。',
        inputSchema: objectSchema({ date_from: dateJsonSchema, date_to: dateJsonSchema, limit: limitJsonSchema }),
        run: listMyTimeSlots,
      },
      {
        name: 'create_time_slot',
        description: '创建当前面试官自己的可预约时段。',
        inputSchema: objectSchema(
          { date: dateJsonSchema, start_time: timeJsonSchema, end_time: timeJsonSchema },
          ['date', 'start_time', 'end_time'],
        ),
        run: createTimeSlot,
      },
      {
        name: 'update_time_slot',
        description: '修改当前面试官自己的未预约时段。',
        inputSchema: objectSchema(
          {
            time_slot_id: positiveNumberSchema,
            date: dateJsonSchema,
            start_time: timeJsonSchema,
            end_time: timeJsonSchema,
            reason: { type: 'string' },
          },
          ['time_slot_id', 'reason'],
        ),
        run: updateTimeSlot,
      },
    ],
  },
  {
    serverId: 'vivaldi.coordinator.organization',
    requiredRole: Role.coordinator,
    description: '协调者使用：员工、岗位、面试官指派查询。',
    tools: [
      {
        name: 'list_users',
        description: '查询员工账号列表，最多返回 10 条。',
        inputSchema: objectSchema({ q: { type: 'string' }, role: roleJsonSchema, limit: limitJsonSchema }),
        run: listOrganizationUsers,
      },
      {
        name: 'list_positions',
        description: '查询招聘岗位列表，最多返回 10 条。',
        inputSchema: objectSchema({ q: { type: 'string' }, limit: limitJsonSchema }),
        run: listOrganizationPositions,
      },
      {
        name: 'get_position',
        description: '查询岗位详情和已指派面试官。',
        inputSchema: objectSchema({ position_id: positiveNumberSchema }, ['position_id']),
        run: getOrganizationPosition,
      },
    ],
  },
  {
    serverId: 'vivaldi.coordinator.candidates',
    requiredRole: Role.coordinator,
    description: '协调者使用：候选人全链路查询、修正和状态推进。',
    tools: [
      searchCandidatesTool('search_candidates', '搜索候选人，最多返回 10 条。'),
      getCandidateTool('get_candidate', '获取候选人详情、简历、状态历史和可选一次性验证码。'),
      {
        name: 'update_candidate_profile',
        description: '修正候选人基础信息或简历 Markdown。',
        inputSchema: objectSchema(
          {
            candidate_id: positiveNumberSchema,
            name: { type: 'string' },
            gender: { type: 'string', enum: ['male', 'female'] },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            resume_markdown: { type: 'string' },
            reason: { type: 'string' },
          },
          ['candidate_id', 'reason'],
        ),
        run: updateCandidateProfile,
      },
      {
        name: 'change_candidate_status',
        description: '按系统状态机推进候选人状态。',
        inputSchema: objectSchema(
          { candidate_id: positiveNumberSchema, to_status: candidateStatusJsonSchema, note: { type: 'string' } },
          ['candidate_id', 'to_status'],
        ),
        run: changeCandidateStatus,
      },
      listHistoryTool('list_candidate_status_history', '查询候选人状态历史。'),
      getOaSubmissionTool('get_candidate_oa_submission', '查看候选人 OA 答卷。'),
      listEvaluationsTool('list_candidate_evaluations', '查看候选人评估历史。'),
    ],
  },
  {
    serverId: 'vivaldi.coordinator.schedule',
    requiredRole: Role.coordinator,
    description: '协调者使用：可预约时段和排期查询。',
    tools: [
      {
        name: 'list_available_time_slots',
        description: '查询可预约面试时段，最多返回 10 条。',
        inputSchema: objectSchema({ position_id: positiveNumberSchema, limit: limitJsonSchema }),
        run: listAvailableTimeSlots,
      },
    ],
  },
  {
    serverId: 'vivaldi.coordinator.operations',
    requiredRole: Role.coordinator,
    description: '协调者使用：系统参数和通知日志运维。',
    tools: [
      {
        name: 'get_system_settings',
        description: '查询系统参数，敏感密钥仅返回掩码。',
        inputSchema: objectSchema({}),
        run: getMaskedSystemSettings,
      },
      {
        name: 'list_notification_logs',
        description: '查询通知日志，最多返回 10 条。',
        inputSchema: objectSchema({
          candidate_id: positiveNumberSchema,
          type: { type: 'string', enum: Object.values(NotificationType) },
          trigger_event: { type: 'string' },
          delivery_status: { type: 'string', enum: Object.values(DeliveryStatus) },
          limit: limitJsonSchema,
        }),
        run: listNotificationLogs,
      },
      {
        name: 'retry_notification_log',
        description: '重试单条失败通知日志。',
        inputSchema: objectSchema({ notification_log_id: positiveNumberSchema }, ['notification_log_id']),
        run: retryNotificationLog,
      },
    ],
  },
];

// Server 注册表使用 Map，便于路由按 server_id 快速取定义。
const serverDefinitionMap = new Map(serverDefinitions.map((definition) => [definition.serverId, definition]));

// 对外暴露全部 Server ID，健康检查或文档生成可以复用。
export function listMcpServers(): McpServerDefinition[] {
  return serverDefinitions;
}

// 根据 Server ID 获取定义，不存在时返回 undefined。
export function getMcpServerDefinition(serverId: string): McpServerDefinition | undefined {
  return serverDefinitionMap.get(serverId);
}
