/** JD Analysis（04 §5.3：analyze 202 → analysis 1:1 覆盖；matches 1:N 留档） */
import { apiDelete, apiGet, apiList, apiSend, withMock } from './client';
import {
  mockAnalyzeJD,
  mockCreateJD,
  mockDeleteJD,
  mockGetAnalysis,
  mockGetJD,
  mockListJDs,
  mockListMatches,
  mockPatchJD,
  mockRunMatch,
} from './mock/handlers';
import type { JDAnalysis, JDMatch, JobDescription, ListResponse, PollTask } from './types';

export type JDWithScore = JobDescription & { latest_match_score: number | null };

export const jdKeys = {
  all: ['job-descriptions'] as const,
  detail: (id: string) => ['job-descriptions', id] as const,
  analysis: (id: string) => ['job-descriptions', id, 'analysis'] as const,
  matches: (id: string) => ['job-descriptions', id, 'matches'] as const,
};

export const listJDs = withMock(mockListJDs, () => apiList<JDWithScore>('/job-descriptions'));
export const createJD = withMock(mockCreateJD, (body: { title?: string; company?: string; raw_text: string }) =>
  apiSend<JobDescription>('POST', '/job-descriptions', body),
);
export const getJD = withMock(mockGetJD, (id: string) => apiGet<JobDescription>(`/job-descriptions/${id}`));
export const patchJD = withMock(mockPatchJD, (id: string, body: Partial<JobDescription>) =>
  apiSend<JobDescription>('PATCH', `/job-descriptions/${id}`, body),
);
export const deleteJD = withMock(mockDeleteJD, (id: string) => apiDelete(`/job-descriptions/${id}`));

export const analyzeJD = withMock(mockAnalyzeJD, (jdId: string) =>
  apiSend<PollTask>('POST', `/job-descriptions/${jdId}/analyze`, {}),
);
export const getAnalysis = withMock(mockGetAnalysis, (jdId: string) =>
  apiGet<JDAnalysis | null>(`/job-descriptions/${jdId}/analysis`),
);
export const listMatches = withMock(mockListMatches, (jdId: string) =>
  apiGet<JDMatch[]>(`/job-descriptions/${jdId}/matches`),
);
export const runMatch = withMock(mockRunMatch, (jdId: string) =>
  apiSend<PollTask>('POST', `/job-descriptions/${jdId}/matches`, {}),
);