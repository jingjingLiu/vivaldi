import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors/HttpError.js';
import { authenticateInternal } from '../services/authService.js';
import {
  assertServerAccess,
  getMcpServerDefinition,
  listMcpServers,
  type McpServerDefinition,
  type McpToolContext,
} from '../mcp/toolRegistry.js';
import type { AuthPrincipal } from '../types/express.d.js';

// JSON-RPC ID 可以是字符串、数字或 null。
type JsonRpcId = string | number | null;

// MCP Client 发来的 JSON-RPC 请求结构。
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

// MCP Server 返回给 Client 的 JSON-RPC 响应结构。
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// SSE 会话保存当前长连接、Server ID 和员工身份。
interface McpSession {
  id: string;
  serverId: string;
  principal: AuthPrincipal;
  response: Response;
  createdAt: Date;
}

// JSON-RPC 协议错误用于区分业务错误和协议错误。
class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

// 当前进程内保存 SSE 会话；服务重启后 MCP Client 需要重新连接。
const sessions = new Map<string, McpSession>();

// MCP 路由独立挂载在 /mcp 下。
export const mcpRouter = Router();

// 统一包装异步路由，交给 Express errorHandler 输出 HTTP 错误。
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// 解析 HTTP Basic Auth，用户名密码只允许出现在 Authorization 头。
function parseBasicAuth(req: Request): { username: string; password: string } {
  const header = req.headers.authorization;
  if (!header?.startsWith('Basic ')) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'MCP connection requires HTTP Basic authentication', {
      messageKey: 'errors.unauthenticated',
      assistantHint: '请在 MCP Client 配置中提供员工用户名和密码，不要把密码作为 Tool 参数传入。',
    });
  }

  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex <= 0) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Invalid HTTP Basic authentication header', {
      messageKey: 'errors.unauthenticated',
    });
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

// 认证员工并校验其是否能访问指定 MCP Server。
async function authenticateForServer(req: Request, definition: McpServerDefinition): Promise<AuthPrincipal> {
  const credentials = parseBasicAuth(req);
  const principal = await authenticateInternal(credentials.username, credentials.password);
  assertServerAccess(definition, principal);
  return principal;
}

// 读取 session_id，同时兼容部分 Client 使用的 sessionId。
function getSessionId(req: Request): string {
  const value = req.query.session_id ?? req.query.sessionId;
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'session_id is required', {
      messageKey: 'errors.validation_error',
    });
  }
  return value;
}

// 写入普通 SSE 字符串事件。
function writeSseString(res: Response, event: string, data: string): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
}

// 写入 JSON SSE 事件，JSON-RPC 响应都走 message 事件。
function writeSseJson(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// 构造 JSON-RPC 成功响应。
function jsonRpcSuccess(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

// 将异常转换为 JSON-RPC 错误响应。
function jsonRpcError(id: JsonRpcId, error: unknown): JsonRpcResponse {
  if (error instanceof RpcError) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: error.code, message: error.message, data: error.data },
    };
  }

  if (error instanceof HttpError) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: mapHttpErrorToJsonRpcCode(error),
        message: error.message,
        data: {
          code: error.code,
          messageKey: readMessageKey(error.details),
          assistantHint: readAssistantHint(error.details),
          details: error.details,
        },
      },
    };
  }

  const message = error instanceof Error ? error.message : 'Internal MCP error';
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32603,
      message,
      data: { code: 'INTERNAL_ERROR', messageKey: 'errors.internal_error' },
    },
  };
}

// HTTP 状态码映射到 JSON-RPC 错误码。
function mapHttpErrorToJsonRpcCode(error: HttpError): number {
  if (error.statusCode === 400) return -32602;
  if (error.statusCode === 401 || error.statusCode === 403) return -32001;
  if (error.statusCode === 404) return -32004;
  if (error.statusCode === 409) return -32009;
  return -32000;
}

// 从 details 中读取多语言 Key；没有配置文件时仍返回稳定 key，便于 Agent 处理。
function readMessageKey(details: unknown): string {
  if (details && typeof details === 'object' && 'messageKey' in details) {
    const value = (details as { messageKey?: unknown }).messageKey;
    if (typeof value === 'string') return value;
  }
  return 'errors.mcp_error';
}

// 从 details 中读取给 Agent 的下一步建议。
function readAssistantHint(details: unknown): string | undefined {
  if (details && typeof details === 'object' && 'assistantHint' in details) {
    const value = (details as { assistantHint?: unknown }).assistantHint;
    if (typeof value === 'string') return value;
  }
  return undefined;
}

// 校验请求是否是单个 JSON-RPC 2.0 对象。
function parseJsonRpcRequest(value: unknown): JsonRpcRequest {
  if (!value || typeof value !== 'object') {
    throw new RpcError(-32600, 'Invalid JSON-RPC request');
  }
  const request = value as Partial<JsonRpcRequest>;
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    throw new RpcError(-32600, 'Invalid JSON-RPC request');
  }
  return request as JsonRpcRequest;
}

// MCP initialize 响应声明当前服务只暴露 tools 能力。
function handleInitialize(session: McpSession, request: JsonRpcRequest): JsonRpcResponse | null {
  if (request.id === undefined) return null;
  return jsonRpcSuccess(request.id, {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: session.serverId,
      version: '0.1.0',
    },
  });
}

// tools/list 返回当前 Server 下所有工具定义。
function handleToolsList(definition: McpServerDefinition, request: JsonRpcRequest): JsonRpcResponse | null {
  if (request.id === undefined) return null;
  return jsonRpcSuccess(request.id, {
    tools: definition.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  });
}

// tools/call 执行业务工具，并用 content + structuredContent 兼容不同 MCP Client。
async function handleToolsCall(
  session: McpSession,
  definition: McpServerDefinition,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  if (request.id === undefined) return null;
  const params = request.params;
  if (!params || typeof params !== 'object') {
    throw new RpcError(-32602, 'tools/call params must be an object');
  }

  const { name, arguments: toolArguments } = params as { name?: unknown; arguments?: unknown };
  if (typeof name !== 'string') {
    throw new RpcError(-32602, 'tools/call params.name must be a string');
  }

  const tool = definition.tools.find((item) => item.name === name);
  if (!tool) {
    throw new HttpError(404, 'TOOL_NOT_FOUND', `MCP tool not found: ${name}`, {
      messageKey: 'errors.not_found',
      assistantHint: '请先调用 tools/list 获取当前 MCP Server 支持的工具名称。',
    });
  }

  const context: McpToolContext = {
    serverId: session.serverId,
    principal: session.principal,
  };
  const structuredContent = await tool.run(context, toolArguments ?? {});
  return jsonRpcSuccess(request.id, {
    content: [
      {
        type: 'text',
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  });
}

// 处理单条 JSON-RPC 请求；通知类请求不返回响应。
async function handleJsonRpc(session: McpSession, requestValue: unknown): Promise<JsonRpcResponse | null> {
  let request: JsonRpcRequest;
  try {
    request = parseJsonRpcRequest(requestValue);
  } catch (error) {
    return jsonRpcError(null, error);
  }

  try {
    const definition = getMcpServerDefinition(session.serverId);
    if (!definition) {
      throw new HttpError(404, 'MCP_SERVER_NOT_FOUND', `MCP server not found: ${session.serverId}`, {
        messageKey: 'errors.not_found',
      });
    }

    switch (request.method) {
      case 'initialize':
        return handleInitialize(session, request);
      case 'notifications/initialized':
        return null;
      case 'ping':
        return request.id === undefined ? null : jsonRpcSuccess(request.id, {});
      case 'tools/list':
        return handleToolsList(definition, request);
      case 'tools/call':
        return handleToolsCall(session, definition, request);
      case 'resources/list':
        return request.id === undefined ? null : jsonRpcSuccess(request.id, { resources: [] });
      case 'prompts/list':
        return request.id === undefined ? null : jsonRpcSuccess(request.id, { prompts: [] });
      default:
        throw new RpcError(-32601, `Method not found: ${request.method}`);
    }
  } catch (error) {
    return request.id === undefined ? null : jsonRpcError(request.id, error);
  }
}

// GET /mcp/health 返回所有已注册 Server，便于人工检查配置。
mcpRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    servers: listMcpServers().map((server) => ({
      server_id: server.serverId,
      required_role: server.requiredRole,
      description: server.description,
      tool_count: server.tools.length,
    })),
  });
});

// GET /mcp/:serverId/health 返回单个 Server 的健康信息。
mcpRouter.get('/:serverId/health', (req, res) => {
  const definition = getMcpServerDefinition(req.params.serverId);
  if (!definition) {
    res.status(404).json({ code: 'MCP_SERVER_NOT_FOUND', message: `MCP server not found: ${req.params.serverId}` });
    return;
  }
  res.json({
    ok: true,
    server_id: definition.serverId,
    required_role: definition.requiredRole,
    description: definition.description,
    tool_count: definition.tools.length,
  });
});

// GET /mcp/:serverId/sse 建立 MCP SSE 长连接。
mcpRouter.get(
  '/:serverId/sse',
  asyncHandler(async (req, res) => {
    const definition = getMcpServerDefinition(req.params.serverId);
    if (!definition) {
      throw new HttpError(404, 'MCP_SERVER_NOT_FOUND', `MCP server not found: ${req.params.serverId}`, {
        messageKey: 'errors.not_found',
      });
    }

    const principal = await authenticateForServer(req, definition);
    const sessionId = randomUUID();
    // 同时返回 snake_case 与 camelCase，兼容标准 MCP Client 和 bach-emcp 的 SSE sessionId 解析逻辑。
    const encodedSessionId = encodeURIComponent(sessionId);
    const endpoint = `/mcp/${definition.serverId}/messages?session_id=${encodedSessionId}&sessionId=${encodedSessionId}`;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const session: McpSession = {
      id: sessionId,
      serverId: definition.serverId,
      principal,
      response: res,
      createdAt: new Date(),
    };
    sessions.set(sessionId, session);

    writeSseString(res, 'endpoint', endpoint);
    writeSseJson(res, 'message', {
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: {
        level: 'info',
        data: `Connected to ${definition.serverId}`,
      },
    });

    req.on('close', () => {
      sessions.delete(sessionId);
    });
  }),
);

// POST /mcp/:serverId/messages 接收 MCP JSON-RPC 消息，并通过 SSE 返回响应。
mcpRouter.post(
  '/:serverId/messages',
  asyncHandler(async (req, res) => {
    const sessionId = getSessionId(req);
    const session = sessions.get(sessionId);
    if (!session || session.serverId !== req.params.serverId) {
      throw new HttpError(404, 'MCP_SESSION_NOT_FOUND', 'MCP session not found or already closed', {
        messageKey: 'errors.not_found',
        assistantHint: '请重新建立 MCP SSE 连接后再调用工具。',
      });
    }

    const messages = Array.isArray(req.body) ? req.body : [req.body];
    const responses = await Promise.all(messages.map((message) => handleJsonRpc(session, message)));

    for (const response of responses) {
      if (response) {
        writeSseJson(session.response, 'message', response);
      }
    }

    res.status(202).end();
  }),
);
