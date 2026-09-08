/**
 * SSE 订阅连接器 —— 06-frontend-design §4.4（实现 04-api-design §3.2）。
 * 真实后端走 EventSource（GET /agent-runs/{id}/events，服务端幂等回放）；
 * Mock 模式走 mock/tasks 的定时器仿真，两者对订阅方事件协议一致。
 * 事件协议（04 §3.2 + 05 §6 预留 stage）：
 *   status → { status, stage? } · chunk → { text } · done → { refs, result? } · error → { code, message }
 */
import { USE_MOCK } from './client';
import { subscribeMockTask } from './mock/tasks';
import type { AgentRunStatus } from './types';

export type AgentEvent =
  | { type: 'status'; status: AgentRunStatus; stage?: string | null }
  | { type: 'chunk'; text: string }
  | { type: 'done'; refs: Record<string, string>; result?: unknown }
  | { type: 'error'; code: string; message: string };

/** 返回取消订阅函数。done/error 为终态事件，此后连接方应自行断开。 */
export function subscribeAgentRun(runId: string, onEvent: (e: AgentEvent) => void): () => void {
  if (USE_MOCK) return subscribeMockTask(runId, onEvent);

  const url = `${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/agent-runs/${runId}/events`;
  const es = new EventSource(url);
  let closed = false;

  const handle = (e: MessageEvent) => {
    if (closed) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    emit(data);
  };

  const emit = (data: Record<string, unknown>) => {
    // 事件类型推断：具名事件直接对应；未命名（默认 message）按字段形状推断
    if (typeof data.text === 'string') {
      onEvent({ type: 'chunk', text: data.text });
    } else if (typeof data.status === 'string') {
      const status = data.status as AgentRunStatus;
      if (status === 'completed') {
        onEvent({ type: 'done', refs: (data.refs as Record<string, string>) ?? {}, result: data.result });
      } else if (status === 'failed') {
        const err = (data.error as { code?: string; message?: string }) ?? {};
        onEvent({ type: 'error', code: err.code ?? 'llm_error', message: err.message ?? '任务失败' });
      } else {
        onEvent({ type: 'status', status, stage: (data.stage as string | null) ?? null });
      }
    }
  };

  es.addEventListener('status', (e) => handle(e as MessageEvent));
  es.addEventListener('chunk', (e) => handle(e as MessageEvent));
  es.addEventListener('done', (e) => handle(e as MessageEvent));
  es.addEventListener('error', (e) => {
    // EventSource 断线自动重连；服务端对已完成任务幂等回放全部事件（04 §3.2），
    // 由 useAgentTask 状态机去重，此处不干预。
    if (closed && e instanceof MessageEvent) return;
    // 网络层 error 无 data 时忽略，等自动重连或外层看门超时
  });
  // 兜底：部分实现不带具名事件（默认 message 通道）
  es.onmessage = (e) => {
    try {
      emit(JSON.parse(e.data));
    } catch {
      // ignore unparsable default messages
    }
  };

  return () => {
    closed = true;
    es.close();
  };
}