/** HR Messages（04 §5.5：生成即保存 + 可编辑，无锁定状态机） */
import { apiDelete, apiGet, apiSend, withMock } from './client';
import {
  mockDeleteHRMessage,
  mockGenerateHRMessage,
  mockGetHRMessage,
  mockListHRMessages,
  mockPatchHRMessage,
} from './mock/handlers';
import type { HRMessage, PollTask } from './types';

export const hrKeys = {
  all: ['hr-messages'] as const,
  detail: (id: string) => ['hr-messages', id] as const,
};

export const listHRMessages = withMock(mockListHRMessages, (params?: { jd_id?: string }) =>
  apiGet<HRMessage[]>('/hr-messages', { params: params as Record<string, unknown> }),
);
export const generateHRMessage = withMock(
  mockGenerateHRMessage,
  (body: { jd_id: string | null; resume_version_id: string | null; scene: HRMessage['scene']; mode: HRMessage['mode'] }) =>
    apiSend<PollTask>('POST', '/hr-messages', body),
);
export const getHRMessage = withMock(mockGetHRMessage, (id: string) => apiGet<HRMessage>(`/hr-messages/${id}`));
export const patchHRMessage = withMock(mockPatchHRMessage, (id: string, body: { content?: string }) =>
  apiSend<HRMessage>('PATCH', `/hr-messages/${id}`, body),
);
export const deleteHRMessage = withMock(mockDeleteHRMessage, (id: string) => apiDelete(`/hr-messages/${id}`));