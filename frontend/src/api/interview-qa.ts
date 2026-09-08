/** Interview QA（04 §5.6：application_id 提供时后端带出 company/position） */
import { apiDelete, apiGet, apiSend, withMock } from './client';
import {
  mockCreateInterviewQA,
  mockDeleteInterviewQA,
  mockListInterviewQA,
  mockPatchInterviewQA,
} from './mock/handlers';
import type { InterviewQA } from './types';

export const interviewKeys = {
  all: ['interview-qa'] as const,
};

export const listInterviewQA = withMock(mockListInterviewQA, (params?: { company?: string }) =>
  apiGet<InterviewQA[]>('/interview-qa', { params: params as Record<string, unknown> }),
);
export const createInterviewQA = withMock(
  mockCreateInterviewQA,
  (body: Omit<InterviewQA, 'id' | 'created_at'>) => apiSend<InterviewQA>('POST', '/interview-qa', body),
);
export const patchInterviewQA = withMock(mockPatchInterviewQA, (id: string, body: Partial<InterviewQA>) =>
  apiSend<InterviewQA>('PATCH', `/interview-qa/${id}`, body),
);
export const deleteInterviewQA = withMock(mockDeleteInterviewQA, (id: string) => apiDelete(`/interview-qa/${id}`));