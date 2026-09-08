/**
 * useAgentTask —— 04 §3.3 统一流式模型（06 §5.1）。
 * 触发（202 + agent_run_id）→ 订阅 SSE（status/thought stage/chunk/done/error）
 * → done 后由 onDone 取实体 / 失效 Query。
 * · 事件 seq 去重：服务端幂等回放 + EventSource 自动重连都可能重发（06 §4.4）
 * · 组件卸载：断开订阅但任务继续（后端侧不停）；回到页面按「先查后听」恢复
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cancelAgentRun } from '../api/agent-runs';
import { subscribeAgentRun, type AgentEvent } from '../api/sse';
import type { PollTask } from '../api/types';

export type AgentTaskPhase = 'idle' | 'triggering' | 'streaming' | 'done' | 'error' | 'cancelled';

export interface AgentTaskState {
  phase: AgentTaskPhase;
  /** 流式文本（chunks 拼装） */
  text: string;
  /** 思考占位阶段（05 决定 #10：reasoner 不下发思考链，只发占位） */
  thinking: boolean;
  agent_run_id: string | null;
  refs: Record<string, string>;
  result: unknown;
  error: { code: string; message: string } | null;
}

const INITIAL: AgentTaskState = {
  phase: 'idle',
  text: '',
  thinking: false,
  agent_run_id: null,
  refs: {},
  result: null,
  error: null,
};

export type TriggerFn = () => Promise<PollTask>;

interface RunOptions {
  /** done 终态回调：refs 指向的实体在此失效/跳转；result 为无实体产物（如回填建议） */
  onDone?: (state: AgentTaskState) => void | Promise<void>;
}

export function useAgentTask() {
  const [state, setState] = useState<AgentTaskState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  const unsubRef = useRef<(() => void) | null>(null);
  const lastSeqRef = useRef(0);
  const doneRef = useRef<((s: AgentTaskState) => void | Promise<void>) | null>(null);

  const finish = useCallback((s: AgentTaskState) => {
    unsubRef.current?.();
    unsubRef.current = null;
    setState(s);
    void doneRef.current?.(s);
    doneRef.current = null;
  }, []);

  const handleEvent = useCallback(
    (e: AgentEvent) => {
      // 终态后忽略迟到事件（重放/重连场景，06 §4.4）
      const cur = stateRef.current;
      if (cur.phase === 'done' || cur.phase === 'error' || cur.phase === 'cancelled') return;

      switch (e.type) {
        case 'status':
          setState((s) => ({ ...s, phase: s.phase === 'triggering' || s.phase === 'streaming' ? 'streaming' : s.phase, thinking: !!e.stage }));
          break;
        case 'chunk':
          setState((s) => ({ ...s, phase: 'streaming', text: s.text + e.text, thinking: false }));
          break;
        case 'done': {
          const done: AgentTaskState = {
            ...stateRef.current,
            phase: 'done',
            thinking: false,
            refs: e.refs,
            result: e.result ?? null,
          };
          finish(done);
          break;
        }
        case 'error': {
          finish({ ...INITIAL, phase: 'error', error: { code: e.code, message: e.message }, agent_run_id: stateRef.current.agent_run_id });
          break;
        }
      }
    },
    [finish],
  );

  const run = useCallback(
    async (trigger: TriggerFn, opts?: RunOptions) => {
      // 重入保护：已有任务在跑时直接返回 false（页面通常同步禁用按钮）
      const cur = stateRef.current;
      if (cur.phase === 'triggering' || cur.phase === 'streaming') return false;

      unsubRef.current?.();
      lastSeqRef.current = 0;
      doneRef.current = opts?.onDone ?? null;
      setState({ ...INITIAL, phase: 'triggering' });

      try {
        const task = await trigger();
        const cur2 = stateRef.current;
        if (cur2.phase !== 'triggering') return false; // 触发期间被取消
        setState((s) => ({ ...s, phase: 'streaming', agent_run_id: task.agent_run_id }));
        unsubRef.current = subscribeAgentRun(task.agent_run_id, handleEvent);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : '任务触发失败';
        finish({ ...INITIAL, phase: 'error', error: { code: 'trigger_failed', message } });
        return false;
      }
    },
    [handleEvent, finish],
  );

  const cancel = useCallback(async () => {
    const id = stateRef.current.agent_run_id;
    unsubRef.current?.();
    unsubRef.current = null;
    setState((s) => ({ ...s, phase: 'cancelled' }));
    if (id) await cancelAgentRun(id).catch(() => undefined);
  }, []);

  const reset = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    setState(INITIAL);
  }, []);

  // 卸载：断开订阅不取消任务（后端继续，回来时靠 done.refs 恢复）
  useEffect(() => () => unsubRef.current?.(), []);

  return useMemo(() => ({ state, run, cancel, reset }), [state, run, cancel, reset]);
}

export type { AgentEvent };