/** 资产表（educations / experiences / honors / skills，04 §4/§5.2） */
import { apiDelete, apiGet, apiSend, withMock } from './client';
import {
  mockCreateSkill,
  mockDeleteSkill,
  mockEducations,
  mockExperiences,
  mockHonors,
  mockListSkills,
  mockPatchSkill,
} from './mock/handlers';
import type { Education, Experience, Honor, Skill } from './types';

export const educationsKeys = {
  all: ['educations'] as const,
};
export const experiencesKeys = {
  all: ['experiences'] as const,
};
export const honorsKeys = {
  all: ['honors'] as const,
};
export const skillsKeys = {
  all: ['skills'] as const,
};

// ── Educations ─────────────────────────────────────────────────────
export const listEducations = withMock(mockEducations.list, () => apiGet<Education[]>('/educations'));
export const createEducation = withMock(mockEducations.create, (body: Omit<Education, 'id' | 'sort_order'>) =>
  apiSend<Education>('POST', '/educations', body),
);
export const patchEducation = withMock(mockEducations.patch, (id: string, body: Partial<Education>) =>
  apiSend<Education>('PATCH', `/educations/${id}`, body),
);
export const deleteEducation = withMock(mockEducations.remove, (id: string) => apiDelete(`/educations/${id}`));
export const reorderEducations = withMock<[string[]], void>(
  (ids) => {
    mockEducations.reorder(ids);
  },
  async (ids) => {
    await apiSend<{ data: null }>('PUT', '/educations/reorder', { ids });
  },
);

// ── Experiences ────────────────────────────────────────────────────
export const listExperiences = withMock(mockExperiences.list, () => apiGet<Experience[]>('/experiences'));
export const createExperience = withMock(mockExperiences.create, (body: Omit<Experience, 'id' | 'sort_order'>) =>
  apiSend<Experience>('POST', '/experiences', body),
);
export const patchExperience = withMock(mockExperiences.patch, (id: string, body: Partial<Experience>) =>
  apiSend<Experience>('PATCH', `/experiences/${id}`, body),
);
export const deleteExperience = withMock(mockExperiences.remove, (id: string) => apiDelete(`/experiences/${id}`));
export const reorderExperiences = withMock<[string[]], void>(
  (ids) => {
    mockExperiences.reorder(ids);
  },
  async (ids) => {
    await apiSend<{ data: null }>('PUT', '/experiences/reorder', { ids });
  },
);

// ── Honors ─────────────────────────────────────────────────────────
export const listHonors = withMock(mockHonors.list, () => apiGet<Honor[]>('/honors'));
export const createHonor = withMock(mockHonors.create, (body: Omit<Honor, 'id' | 'sort_order'>) =>
  apiSend<Honor>('POST', '/honors', body),
);
export const patchHonor = withMock(mockHonors.patch, (id: string, body: Partial<Honor>) =>
  apiSend<Honor>('PATCH', `/honors/${id}`, body),
);
export const deleteHonor = withMock(mockHonors.remove, (id: string) => apiDelete(`/honors/${id}`));
export const reorderHonors = withMock<[string[]], void>(
  (ids) => {
    mockHonors.reorder(ids);
  },
  async (ids) => {
    await apiSend<{ data: null }>('PUT', '/honors/reorder', { ids });
  },
);

// ── Skills（重名 409 skill_name_exists）───────────────────────────
export const listSkills = withMock(mockListSkills, () => apiGet<Skill[]>('/skills'));
export const createSkill = withMock(mockCreateSkill, (body: { name: string; proficiency: Skill['proficiency'] }) =>
  apiSend<Skill>('POST', '/skills', body),
);
export const patchSkill = withMock(mockPatchSkill, (id: string, body: Partial<Skill>) =>
  apiSend<Skill>('PATCH', `/skills/${id}`, body),
);
export const deleteSkill = withMock(mockDeleteSkill, (id: string) => apiDelete(`/skills/${id}`));