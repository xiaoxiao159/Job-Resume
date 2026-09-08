/** Agent Runs 横切（04 §3.3；feedback 端点预留 05 待确认 #4 → 06 §10.2） */
import { apiGet, apiList, apiSend, withMock } from './client';
import {
  mockCancelAgentRun,
  mockGetAgentRun,
  mockListAgentRuns,
  mockSendAgentRunFeedback,
} from './mock/handlers';
import type { AgentRun, ListParams } from './types';

export const agentRunKeys = {
  all: ['agent-runs'] as const,
  detail: (id: string) => ['agent-runs', id] as const,
};

export const getAgentRun = withMock(mockGetAgentRun, (id: string) => apiGet<AgentRun>(`/agent-runs/${id}`));
export const listAgentRuns = withMock(mockListAgentRuns, (params?: ListParams) =>
  apiList<AgentRun>('/agent-runs', { params: params as Record<string, unknown> }),
);
export const cancelAgentRun = withMock(mockCancelAgentRun, (id: string) =>
  apiSend<{ status: string }>('POST', `/agent-runs/${id}/cancel`, {}),
);

/**
 * 预留：👍/👎 反馈（03 §4.1）。真实后端端点为
 * POST /agent-runs/{id}/feedback —— 待 02 升版 feedback 列 + 04 增补端点后启用。
 */
export const sendAgentRunFeedback = withMock<[string, 'up' | 'down'], void>(
  (id, feedback) => {
    mockSendAgentRunFeedback(id, feedback);
  },
  async (id, feedback) => {
    await apiSend<{ data: null }>('POST', `/agent-runs/${id}/feedback`, { feedback });
  },
);