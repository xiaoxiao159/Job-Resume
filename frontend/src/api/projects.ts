/** Projects + Evidence + 技能关联 + 表达 + AI 辅助填写（04 §5.2） */
import { apiDelete, apiGet, apiList, apiSend, withMock } from './client';
import {
  mockAssistChat,
  mockAssistQuestionnaire,
  mockAssistRefill,
  mockCreateEvidence,
  mockCreateProject,
  mockDeleteEvidence,
  mockDeleteProject,
  mockGenerateExpression,
  mockGetProject,
  mockGetProjectSkills,
  mockListEvidence,
  mockListExpressions,
  mockListProjects,
  mockPatchEvidence,
  mockPatchExpression,
  mockPatchProject,
  mockSetProjectSkills,
} from './mock/handlers';
import type {
  ChatMessage,
  Evidence,
  ListParams,
  ListResponse,
  PollTask,
  Project,
  ProjectExpression,
  ProjectExpressionContent,
  QuestionnaireAnswer,
  Skill,
} from './types';

export const projectKeys = {
  all: ['projects'] as const,
  list: (params?: ListParams) => ['projects', 'list', params] as const,
  detail: (id: string) => ['projects', id] as const,
  evidence: (id: string) => ['projects', id, 'evidence'] as const,
  skills: (id: string) => ['projects', id, 'skills'] as const,
  expressions: (id: string, type?: string) => ['projects', id, 'expressions', type ?? 'all'] as const,
};

export const listProjects = withMock(mockListProjects, (params?: ListParams) =>
  apiList<Project>('/projects', { params: params as Record<string, unknown> }),
);
export const createProject = withMock(mockCreateProject, (body: Omit<Project, 'id' | 'sort_order' | 'created_at'>) =>
  apiSend<Project>('POST', '/projects', body),
);
export const getProject = withMock(mockGetProject, (id: string) => apiGet<Project>(`/projects/${id}`));
export const patchProject = withMock(mockPatchProject, (id: string, body: Partial<Project>) =>
  apiSend<Project>('PATCH', `/projects/${id}`, body),
);
export const deleteProject = withMock(mockDeleteProject, (id: string) => apiDelete(`/projects/${id}`));

export const listEvidence = withMock(mockListEvidence, (projectId: string) =>
  apiGet<Evidence[]>(`/projects/${projectId}/evidence`),
);
export const createEvidence = withMock(mockCreateEvidence, (projectId: string, body: Omit<Evidence, 'id' | 'project_id'>) =>
  apiSend<Evidence>('POST', `/projects/${projectId}/evidence`, body),
);
export const patchEvidence = withMock(mockPatchEvidence, (id: string, body: Partial<Evidence>) =>
  apiSend<Evidence>('PATCH', `/evidence/${id}`, body),
);
export const deleteEvidence = withMock(mockDeleteEvidence, (id: string) => apiDelete(`/evidence/${id}`));

export const getProjectSkills = withMock(mockGetProjectSkills, (projectId: string) =>
  apiGet<Skill[]>(`/projects/${projectId}/skills`),
);
export const setProjectSkills = withMock<[string, string[]], void>(
  (projectId, skillIds) => {
    mockSetProjectSkills(projectId, skillIds);
  },
  async (projectId, skillIds) => {
    await apiSend<{ data: null }>('PUT', `/projects/${projectId}/skills`, { skill_ids: skillIds });
  },
);

// ── 项目表达（04 §5.2 M3；POST 生成 202、PATCH 确认/编辑）──────────
export const listExpressions = withMock(mockListExpressions, (projectId: string, type?: string) =>
  apiGet<ProjectExpression[]>(`/projects/${projectId}/expressions`, {
    params: type ? { type } : undefined,
  }),
);
export const generateExpression = withMock(mockGenerateExpression, (projectId: string, type: ProjectExpression['type']) =>
  apiSend<PollTask>('POST', `/projects/${projectId}/expressions`, { type }),
);
export const patchExpression = withMock(
  mockPatchExpression,
  (id: string, patch: { status?: ProjectExpression['status']; content?: ProjectExpressionContent }) =>
    apiSend<ProjectExpression>('PATCH', `/project-expressions/${id}`, patch),
);

// ── AI 辅助填写（无会话表：前端持历史全量发送，04 决定 #4）────────
export const assistQuestionnaire = withMock(mockAssistQuestionnaire, (projectId: string, answers: QuestionnaireAnswer[]) =>
  apiSend<PollTask>('POST', `/projects/${projectId}/assist/questionnaire`, { answers }),
);
export const assistChat = withMock(mockAssistChat, (projectId: string, messages: ChatMessage[]) =>
  apiSend<PollTask>('POST', `/projects/${projectId}/assist/messages`, { messages }),
);
export const assistRefill = withMock(mockAssistRefill, (projectId: string, messages: ChatMessage[]) =>
  apiSend<PollTask>('POST', `/projects/${projectId}/assist/refill`, { messages }),
);