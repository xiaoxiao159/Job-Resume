/** Applications（04 §5.6：筛选/分页/排序；状态流转 = PATCH status） */
import { apiDelete, apiGet, apiList, apiSend, withMock } from './client';
import {
  mockCreateApplication,
  mockDeleteApplication,
  mockGetApplication,
  mockListApplications,
  mockPatchApplication,
} from './mock/handlers';
import type { Application } from './types';

export type ApplicationListParams = {
  page?: number;
  per_page?: number;
  q?: string;
  sort?: string;
  /** 03 §3.3 深链接：/applications?status=interview,offer */
  status?: string;
};

export const applicationKeys = {
  all: ['applications'] as const,
  list: (params?: ApplicationListParams) => ['applications', 'list', params] as const,
  detail: (id: string) => ['applications', id] as const,
};

export const listApplications = withMock(mockListApplications, (params?: ApplicationListParams) =>
  apiList<Application>('/applications', { params: params as Record<string, unknown> }),
);
export const createApplication = withMock(
  mockCreateApplication,
  (body: Omit<Application, 'id' | 'created_at' | 'resume_version'>) => apiSend<Application>('POST', '/applications', body),
);
export const getApplication = withMock(mockGetApplication, (id: string) => apiGet<Application>(`/applications/${id}`));
export const patchApplication = withMock(mockPatchApplication, (id: string, body: Partial<Application>) =>
  apiSend<Application>('PATCH', `/applications/${id}`, body),
);
export const deleteApplication = withMock(mockDeleteApplication, (id: string) => apiDelete(`/applications/${id}`));