/** Resumes / Resume Versions（04 §5.4：pending 可编辑、confirm 定稿锁定） */
import { apiDelete, apiGet, apiList, apiRaw, apiSend, withMock } from './client';
import {
  mockConfirmVersion,
  mockCreateResume,
  mockDeleteResume,
  mockExportVersion,
  mockGenerateVersion,
  mockGetResume,
  mockGetVersion,
  mockListResumes,
  mockListVersions,
  mockPatchResume,
  mockPatchVersionContent,
  mockPreviewVersion,
  mockReflectVersion,
  mockRegenerateVersion,
} from './mock/handlers';
import type { ListResponse, PollTask, Resume, ResumeContent, ResumeVersion } from './types';

export const resumeKeys = {
  all: ['resumes'] as const,
  detail: (id: string) => ['resumes', id] as const,
  versions: (id: string) => ['resumes', id, 'versions'] as const,
  version: (id: string) => ['resume-versions', id] as const,
};

export const listResumes = withMock(mockListResumes, () => apiList<Resume>('/resumes'));

export const createResume = withMock(mockCreateResume, (body: { title?: string; target_role: string }) =>
  apiSend<Resume>('POST', '/resumes', body),
);
export const getResume = withMock(mockGetResume, (id: string) => apiGet<Resume>(`/resumes/${id}`));
/** 04 §5.4：PATCH 改 template / title */
export const patchResume = withMock(mockPatchResume, (id: string, body: { template?: Resume['template']; title?: string }) =>
  apiSend<Resume>('PATCH', `/resumes/${id}`, body),
);
export const deleteResume = withMock(mockDeleteResume, (id: string) => apiDelete(`/resumes/${id}`));

export const listVersions = withMock(mockListVersions, (resumeId: string) =>
  apiGet<ResumeVersion[]>(`/resumes/${resumeId}/versions`),
);
/** 生成定制简历（202；jd_id 可空 = Master 版） */
export const generateVersion = withMock(
  mockGenerateVersion,
  (resumeId: string, body: { jd_id?: string | null; instruction?: string | null }) =>
    apiSend<PollTask>('POST', `/resumes/${resumeId}/versions`, body),
);
export const getVersion = withMock(mockGetVersion, (id: string) => apiGet<ResumeVersion>(`/resume-versions/${id}`));
/** 仅 pending 可编辑；定稿后 409 locked_version */
export const patchVersionContent = withMock(mockPatchVersionContent, (id: string, content: ResumeContent) =>
  apiSend<ResumeVersion>('PATCH', `/resume-versions/${id}`, { content }),
);
/** 重生成 = 新版本号（当前版本不动，02 决策 #5） */
export const regenerateVersion = withMock(mockRegenerateVersion, (id: string, body: { instruction?: string | null }) =>
  apiSend<PollTask>('POST', `/resume-versions/${id}/regenerate`, body),
);
export const reflectVersion = withMock(mockReflectVersion, (id: string) =>
  apiSend<PollTask>('POST', `/resume-versions/${id}/reflect`, {}),
);
export const confirmVersion = withMock(mockConfirmVersion, (id: string) =>
  apiSend<{ reflection_status: 'passed' | 'issues'; locked: boolean }>('POST', `/resume-versions/${id}/confirm`, {}),
);

/** 04 §5.4：后端统一渲染（text/markdown、text/html），非 envelope（§10.4） */
export async function previewVersion(id: string, format: 'md' | 'html'): Promise<string> {
  if (import.meta.env.VITE_USE_MOCK === 'true') return mockPreviewVersion(id, format);
  const res = await apiRaw(`/resume-versions/${id}/preview`, { params: { format } });
  return res.text();
}

/** 04 §5.4：HTML/PDF 文件流下载 */
export async function exportVersion(id: string, format: 'html' | 'pdf'): Promise<{ blob: Blob; filename: string }> {
  if (import.meta.env.VITE_USE_MOCK === 'true') return mockExportVersion(id, format);
  const res = await apiRaw(`/resume-versions/${id}/export`, { params: { format } });
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const m = /filename="?([^";]+)"?/.exec(disposition);
  return { blob: await res.blob(), filename: m?.[1] ?? `resume.${format}` };
}