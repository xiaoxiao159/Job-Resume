/**
 * Mock 域实现 —— 06-frontend-design §4.5。
 * 每个函数与 api/ 域文件同名同签名：envelope、分页、错误码均与 04 对齐，
 * 换真实后端只改 .env 开关（withMock 分流）。
 */
import { ApiError } from '../client';
import type {
  Application,
  BasicInfo,
  ChatMessage,
  Education,
  Evidence,
  Experience,
  Honor,
  HRMessage,
  InterviewQA,
  JDAnalysis,
  JDMatch,
  JobDescription,
  ListParams,
  ListResponse,
  PollTask,
  Project,
  ProjectExpression,
  ProjectExpressionContent,
  QuestionnaireAnswer,
  Resume,
  ResumeContent,
  ResumeVersion,
  Skill,
} from '../types';
import { db, isoNow, mutate, nextId } from './db';
import { buildResumeHtml, buildResumeMarkdown } from '../../lib/resume-render';
import {
  cancelMockTask,
  chatScript,
  expressionScript,
  getMockAgentRun,
  hrMessageScript,
  jdAnalyzeScript,
  jdMatchScript,
  polishSelfEvalScript,
  questionnaireScript,
  refillScript,
  reflectScript,
  resumeGenerateScript,
  simulateTask,
} from './tasks';

// ── 通用工具 ────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Mock 假延迟：让 loading 反馈可见（03 §4.2 分级反馈可被体验） */
const latency = () => sleep(60 + Math.random() * 120);

function notFound(id: string): never {
  throw new ApiError(404, 'not_found', `资源不存在（${id}）`);
}

function paginate<T>(rows: T[], params?: ListParams): ListResponse<T> {
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.min(Math.max(1, params?.per_page ?? 20), 100);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return {
    data: rows.slice((page - 1) * perPage, page * perPage),
    meta: { total, page, per_page: perPage, total_pages: totalPages },
  };
}

const running = (runId: string): PollTask => ({ agent_run_id: runId, status: 'running' });

// ── Dashboard（04 §5.1：统计口径后端 SQL 计算）─────────────────────
export async function mockGetDashboard() {
  await latency();
  const d = db();
  const apps = d.applications;
  const applied = apps.filter((a) => a.status !== 'to_apply').length;
  const replied = apps.filter((a) => ['replied', 'interview', 'offer'].includes(a.status)).length;
  const interview = apps.filter((a) => a.status === 'interview').length;
  const offer = apps.filter((a) => a.status === 'offer').length;
  const withVersion = (id: string | null) => {
    const v = id ? d.resume_versions.find((x) => x.id === id) : undefined;
    if (!v) return null;
    const r = d.resumes.find((x) => x.id === v.resume_id);
    return { id: v.id, resume_title: r?.title ?? '', version_number: v.version_number };
  };
  return {
    stats: { applied, replied, interview, offer, reply_rate: applied ? replied / applied : 0 },
    asset_progress: {
      basic_info: !!d.basic_info,
      projects_count: d.projects.length,
      skills_count: d.skills.length,
      education_count: d.educations.length,
    },
    recent_applications: [...apps]
      .sort((a, b) => (b.applied_at ?? '').localeCompare(a.applied_at ?? ''))
      .slice(0, 5)
      .map((a) => ({ ...a, resume_version: withVersion(a.resume_version_id) })),
  };
}

// ── Basic Info（单例 upsert，04 §5.2）──────────────────────────────
export async function mockGetBasicInfo(): Promise<BasicInfo | null> {
  await latency();
  return db().basic_info;
}

export async function mockPutBasicInfo(body: BasicInfo): Promise<BasicInfo> {
  await latency();
  return mutate((d) => {
    d.basic_info = { ...body };
    return d.basic_info;
  });
}

export async function mockPolishSelfEval(): Promise<PollTask> {
  await latency();
  const runId = simulateTask('polish_self_eval', 'polish_self_eval', {}, polishSelfEvalScript());
  return running(runId);
}

// ── 三张同构资产表（educations / experiences / honors，04 §4 端点）──
type Row = { id: string; sort_order: number };

function listRows<T extends Row>(rows: T[]): Promise<T[]> {
  return latency().then(() => [...rows].sort((a, b) => a.sort_order - b.sort_order));
}

function makeCRUD<T extends Row>(collection: (d: ReturnType<typeof db>) => T[]) {
  return {
    async list(): Promise<T[]> {
      return listRows(collection(db()));
    },
    async create(body: Omit<T, 'id' | 'sort_order'>): Promise<T> {
      await latency();
      return mutate((d) => {
        const rows = collection(d);
        const row = { ...(body as object), id: nextId(), sort_order: rows.length } as T;
        rows.push(row);
        return row;
      });
    },
    async patch(id: string, body: Partial<T>): Promise<T> {
      await latency();
      return mutate((d) => {
        const row = collection(d).find((x) => x.id === id);
        if (!row) notFound(id);
        Object.assign(row, body);
        return row;
      });
    },
    async remove(id: string): Promise<void> {
      await latency();
      mutate((d) => {
        const rows = collection(d);
        const i = rows.findIndex((x) => x.id === id);
        if (i < 0) notFound(id);
        rows.splice(i, 1);
        rows.forEach((x, j) => (x.sort_order = j));
      });
    },
    async reorder(ids: string[]): Promise<void> {
      await latency();
      mutate((d) => {
        const rows = collection(d);
        ids.forEach((id, i) => {
          const row = rows.find((x) => x.id === id);
          if (row) row.sort_order = i;
        });
        rows.sort((a, b) => a.sort_order - b.sort_order);
      });
    },
  };
}

export const mockEducations = makeCRUD<Education>((d) => d.educations);
export const mockExperiences = makeCRUD<Experience>((d) => d.experiences);
export const mockHonors = makeCRUD<Honor>((d) => d.honors);

// ── Skills（04 §5.2；UNIQUE(name) 409 skill_name_exists）───────────
export async function mockListSkills(): Promise<Skill[]> {
  return latency().then(() => [...db().skills].sort((a, b) => a.name.localeCompare(b.name)));
}

export async function mockCreateSkill(body: { name: string; proficiency: Skill['proficiency'] }): Promise<Skill> {
  await latency();
  return mutate((d) => {
    if (d.skills.some((s) => s.name === body.name)) {
      throw new ApiError(409, 'skill_name_exists', `技能「${body.name}」已存在`);
    }
    const skill: Skill = { id: nextId(), name: body.name, proficiency: body.proficiency };
    d.skills.push(skill);
    return skill;
  });
}

export async function mockPatchSkill(id: string, body: Partial<Skill>): Promise<Skill> {
  await latency();
  return mutate((d) => {
    const s = d.skills.find((x) => x.id === id);
    if (!s) notFound(id);
    if (body.name && d.skills.some((x) => x.name === body.name && x.id !== id)) {
      throw new ApiError(409, 'skill_name_exists', `技能「${body.name}」已存在`);
    }
    Object.assign(s, body);
    return s;
  });
}

export async function mockDeleteSkill(id: string): Promise<void> {
  await latency();
  mutate((d) => {
    const i = d.skills.findIndex((x) => x.id === id);
    if (i < 0) notFound(id);
    d.skills.splice(i, 1);
    d.project_skills = d.project_skills.filter((x) => x.skill_id !== id);
  });
}

// ── Projects（04 §5.2；DELETE 级联 evidence/expressions）───────────
export async function mockListProjects(params?: ListParams): Promise<ListResponse<Project>> {
  await latency();
  const d = db();
  let rows = [...d.projects].sort((a, b) => a.sort_order - b.sort_order);
  if (params?.q) rows = rows.filter((p) => p.name.includes(params.q!) || p.tech_stack.some((t) => t.includes(params.q!)));
  return paginate(rows, params);
}

export async function mockCreateProject(body: Omit<Project, 'id' | 'sort_order' | 'created_at'>): Promise<Project> {
  await latency();
  return mutate((d) => {
    const row: Project = { ...body, id: nextId(), sort_order: d.projects.length, created_at: isoNow() };
    d.projects.push(row);
    return row;
  });
}

export async function mockGetProject(id: string): Promise<Project> {
  await latency();
  const p = db().projects.find((x) => x.id === id);
  if (!p) notFound(id);
  return p;
}

export async function mockPatchProject(id: string, body: Partial<Project>): Promise<Project> {
  await latency();
  return mutate((d) => {
    const p = d.projects.find((x) => x.id === id);
    if (!p) notFound(id);
    Object.assign(p, body);
    return p;
  });
}

export async function mockDeleteProject(id: string): Promise<void> {
  await latency();
  mutate((d) => {
    const i = d.projects.findIndex((x) => x.id === id);
    if (i < 0) notFound(id);
    d.projects.splice(i, 1);
    d.evidence = d.evidence.filter((e) => e.project_id !== id);
    d.project_expressions = d.project_expressions.filter((e) => e.project_id !== id);
    d.project_skills = d.project_skills.filter((x) => x.project_id !== id);
  });
}

// ── Evidence ───────────────────────────────────────────────────────
export async function mockListEvidence(projectId: string): Promise<Evidence[]> {
  await latency();
  return db().evidence.filter((e) => e.project_id === projectId);
}

export async function mockCreateEvidence(projectId: string, body: Omit<Evidence, 'id' | 'project_id'>): Promise<Evidence> {
  await latency();
  return mutate((d) => {
    const row: Evidence = { ...body, id: nextId(), project_id: projectId };
    d.evidence.push(row);
    return row;
  });
}

export async function mockPatchEvidence(id: string, body: Partial<Evidence>): Promise<Evidence> {
  await latency();
  return mutate((d) => {
    const e = d.evidence.find((x) => x.id === id);
    if (!e) notFound(id);
    Object.assign(e, body);
    return e;
  });
}

export async function mockDeleteEvidence(id: string): Promise<void> {
  await latency();
  mutate((d) => {
    const i = d.evidence.findIndex((x) => x.id === id);
    if (i < 0) notFound(id);
    d.evidence.splice(i, 1);
  });
}

// ── 项目技能关联（PUT 批量替换，事务语义，04 §5.2）─────────────────
export async function mockGetProjectSkills(projectId: string): Promise<Skill[]> {
  await latency();
  const d = db();
  const ids = d.project_skills.filter((x) => x.project_id === projectId).map((x) => x.skill_id);
  return d.skills.filter((s) => ids.includes(s.id));
}

export async function mockSetProjectSkills(projectId: string, skillIds: string[]): Promise<void> {
  await latency();
  mutate((d) => {
    d.project_skills = d.project_skills.filter((x) => x.project_id !== projectId);
    for (const sid of skillIds) d.project_skills.push({ project_id: projectId, skill_id: sid });
  });
}

// ── 项目表达（04 §5.2；重新生成 = 新版本号，无覆盖语义）───────────
export async function mockListExpressions(projectId: string, type?: string): Promise<ProjectExpression[]> {
  await latency();
  return db()
    .project_expressions.filter((e) => e.project_id === projectId && (!type || e.type === type))
    .sort((a, b) => b.version_number - a.version_number);
}

export async function mockGenerateExpression(projectId: string, type: ProjectExpression['type']): Promise<PollTask> {
  await latency();
  const d = db();
  if (!d.projects.some((p) => p.id === projectId)) notFound(projectId);
  const runId = simulateTask('project_expression', `project_expression_${type}`, { project_id: projectId, type }, expressionScript(projectId, type));
  return running(runId);
}

export async function mockPatchExpression(id: string, patch: { status?: ProjectExpression['status']; content?: ProjectExpressionContent }): Promise<ProjectExpression> {
  await latency();
  return mutate((d) => {
    const e = d.project_expressions.find((x) => x.id === id);
    if (!e) notFound(id);
    if (patch.status) e.status = patch.status;
    if (patch.content) e.content = patch.content;
    return e;
  });
}

// ── AI 辅助填写（两段式无状态多轮，04 §5.2）───────────────────────
export async function mockAssistQuestionnaire(projectId: string, answers: QuestionnaireAnswer[]): Promise<PollTask> {
  await latency();
  const runId = simulateTask('asset_assist', 'assist_questionnaire', { project_id: projectId, answers }, questionnaireScript(projectId, answers));
  return running(runId);
}

export async function mockAssistChat(projectId: string, messages: ChatMessage[]): Promise<PollTask> {
  await latency();
  const runId = simulateTask('asset_assist', 'assist_chat', { project_id: projectId, messages }, chatScript(projectId, messages));
  return running(runId);
}

export async function mockAssistRefill(projectId: string, messages: ChatMessage[]): Promise<PollTask> {
  await latency();
  const runId = simulateTask('asset_assist', 'assist_refill', { project_id: projectId, messages }, refillScript(projectId, messages));
  return running(runId);
}

// ── JD Analysis（04 §5.3；analysis 1:1 覆盖、matches 1:N 留档）─────
export async function mockListJDs(): Promise<ListResponse<JobDescription & { latest_match_score: number | null }>> {
  await latency();
  const d = db();
  const rows = [...d.job_descriptions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((jd) => {
      const latest = d.jd_matches.filter((m) => m.jd_id === jd.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return { ...jd, latest_match_score: latest?.overall_score ?? null };
    });
  return paginate(rows);
}

export async function mockCreateJD(body: { title?: string; company?: string; raw_text: string }): Promise<JobDescription> {
  await latency();
  return mutate((d) => {
    const row: JobDescription = { id: nextId(), title: body.title ?? '', company: body.company ?? '', raw_text: body.raw_text, created_at: isoNow() };
    d.job_descriptions.unshift(row);
    return row;
  });
}

export async function mockGetJD(id: string): Promise<JobDescription> {
  await latency();
  const jd = db().job_descriptions.find((x) => x.id === id);
  if (!jd) notFound(id);
  return jd;
}

export async function mockPatchJD(id: string, body: Partial<JobDescription>): Promise<JobDescription> {
  await latency();
  return mutate((d) => {
    const jd = d.job_descriptions.find((x) => x.id === id);
    if (!jd) notFound(id);
    Object.assign(jd, body);
    return jd;
  });
}

export async function mockDeleteJD(id: string): Promise<void> {
  await latency();
  mutate((d) => {
    const i = d.job_descriptions.findIndex((x) => x.id === id);
    if (i < 0) notFound(id);
    d.job_descriptions.splice(i, 1);
    d.jd_analyses = d.jd_analyses.filter((a) => a.jd_id !== id);
    d.jd_matches = d.jd_matches.filter((m) => m.jd_id !== id);
  });
}

export async function mockAnalyzeJD(jdId: string): Promise<PollTask> {
  await latency();
  if (!db().job_descriptions.some((x) => x.id === jdId)) notFound(jdId);
  const runId = simulateTask('jd_analyze', 'jd_analyze', { jd_id: jdId }, jdAnalyzeScript(jdId));
  return running(runId);
}

export async function mockGetAnalysis(jdId: string): Promise<JDAnalysis | null> {
  await latency();
  return db().jd_analyses.find((a) => a.jd_id === jdId) ?? null;
}

export async function mockListMatches(jdId: string): Promise<JDMatch[]> {
  await latency();
  return db()
    .jd_matches.filter((m) => m.jd_id === jdId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function mockRunMatch(jdId: string): Promise<PollTask> {
  await latency();
  if (!db().job_descriptions.some((x) => x.id === jdId)) notFound(jdId);
  const runId = simulateTask('jd_match', 'jd_match', { jd_id: jdId }, jdMatchScript(jdId));
  return running(runId);
}

// ── Resumes / Versions（04 §5.4 状态机：pending 可编辑、confirm 锁定）─
const LOCKED = new ApiError(409, 'locked_version', '该版本已定稿锁定，不可编辑');

export async function mockListResumes(): Promise<ListResponse<Resume>> {
  await latency();
  return paginate([...db().resumes].sort((a, b) => b.created_at.localeCompare(a.created_at)));
}

export async function mockCreateResume(body: { title?: string; target_role: string }): Promise<Resume> {
  await latency();
  return mutate((d) => {
    if (d.resumes.some((r) => r.target_role === body.target_role)) {
      throw new ApiError(409, 'target_role_exists', `已有目标岗位为「${body.target_role}」的简历`);
    }
    const row: Resume = {
      id: nextId(),
      title: body.title || body.target_role,
      target_role: body.target_role,
      template: null,
      created_at: isoNow(),
    };
    d.resumes.push(row);
    return row;
  });
}

export async function mockGetResume(id: string): Promise<Resume> {
  await latency();
  const r = db().resumes.find((x) => x.id === id);
  if (!r) notFound(id);
  return r;
}

export async function mockPatchResume(id: string, body: { template?: Resume['template']; title?: string }): Promise<Resume> {
  await latency();
  return mutate((d) => {
    const r = d.resumes.find((x) => x.id === id);
    if (!r) notFound(id);
    Object.assign(r, body);
    return r;
  });
}

export async function mockDeleteResume(id: string): Promise<void> {
  await latency();
  mutate((d) => {
    const i = d.resumes.findIndex((x) => x.id === id);
    if (i < 0) notFound(id);
    d.resumes.splice(i, 1);
    d.resume_versions = d.resume_versions.filter((v) => v.resume_id !== id);
  });
}

export async function mockListVersions(resumeId: string): Promise<ResumeVersion[]> {
  await latency();
  return db()
    .resume_versions.filter((v) => v.resume_id === resumeId)
    .sort((a, b) => b.version_number - a.version_number);
}

export async function mockGenerateVersion(resumeId: string, body: { jd_id?: string | null; instruction?: string | null }): Promise<PollTask> {
  await latency();
  if (!db().resumes.some((x) => x.id === resumeId)) notFound(resumeId);
  const runId = simulateTask(
    'resume_generate',
    'resume_generate',
    { resume_id: resumeId, jd_id: body.jd_id ?? null, instruction: body.instruction ?? null },
    resumeGenerateScript(resumeId, body.jd_id ?? null, body.instruction ?? null),
  );
  return running(runId);
}

export async function mockGetVersion(id: string): Promise<ResumeVersion> {
  await latency();
  const v = db().resume_versions.find((x) => x.id === id);
  if (!v) notFound(id);
  return v;
}

export async function mockPatchVersionContent(id: string, content: ResumeContent): Promise<ResumeVersion> {
  await latency();
  return mutate((d) => {
    const v = d.resume_versions.find((x) => x.id === id);
    if (!v) notFound(id);
    if (v.confirmed_at) throw LOCKED;
    v.content = content;
    v.updated_at = isoNow();
    return v;
  });
}

export async function mockRegenerateVersion(id: string, body: { instruction?: string | null }): Promise<PollTask> {
  await latency();
  const v = db().resume_versions.find((x) => x.id === id);
  if (!v) notFound(id);
  const runId = simulateTask(
    'resume_generate',
    'resume_generate',
    { resume_id: v.resume_id, based_on_version: id, instruction: body.instruction ?? null },
    resumeGenerateScript(v.resume_id, null, body.instruction ?? null),
  );
  return running(runId);
}

export async function mockReflectVersion(id: string): Promise<PollTask> {
  await latency();
  if (!db().resume_versions.some((x) => x.id === id)) notFound(id);
  const runId = simulateTask('reflection', 'reflection', { resume_version_id: id }, reflectScript(id));
  return running(runId);
}

export async function mockConfirmVersion(id: string): Promise<{ reflection_status: 'passed' | 'issues'; locked: boolean }> {
  await latency();
  return mutate((d) => {
    const v = d.resume_versions.find((x) => x.id === id);
    if (!v) notFound(id);
    // 04：reflection 由后端确定性判定；未验证时确认即判为通过
    if (v.reflection_status === 'pending') {
      v.reflection_status = 'passed';
      v.reflection_result = {
        match_score: 76,
        coverage: { hit_keywords: [], missing_keywords: [] },
        fabrication: { passed: true, issues: [] },
      };
    }
    v.confirmed_at = isoNow();
    v.updated_at = isoNow();
    return { reflection_status: v.reflection_status as 'passed' | 'issues', locked: true };
  });
}

export async function mockPreviewVersion(id: string, format: 'md' | 'html'): Promise<string> {
  await latency();
  const v = db().resume_versions.find((x) => x.id === id);
  if (!v) notFound(id);
  if (format === 'md') return buildResumeMarkdown(v.content);
  const resume = db().resumes.find((r) => r.id === v.resume_id);
  if (!resume?.template) {
    throw new ApiError(409, 'template_not_selected', '请先为该简历选择模板，再预览 HTML');
  }
  return buildResumeHtml(v.content, resume.template);
}

export async function mockExportVersion(id: string, format: 'html' | 'pdf'): Promise<{ blob: Blob; filename: string }> {
  const v = db().resume_versions.find((x) => x.id === id);
  if (!v) notFound(id);
  const resume = db().resumes.find((r) => r.id === v.resume_id);
  if (format === 'html' && !resume?.template) {
    throw new ApiError(409, 'template_not_selected', '请先为该简历选择模板，再导出 HTML');
  }
  const html = buildResumeHtml(v.content, resume?.template ?? null);
  const blob = new Blob([html], { type: format === 'pdf' ? 'application/pdf' : 'text/html' });
  return { blob, filename: `${resume?.title ?? 'resume'}-v${v.version_number}.${format}` };
}

// ── HR Messages（04 §5.5：生成即保存 + 可编辑，无锁定状态机）──────
export async function mockListHRMessages(params?: { jd_id?: string }): Promise<HRMessage[]> {
  await latency();
  const rows = [...db().hr_messages].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return params?.jd_id ? rows.filter((m) => m.jd_id === params.jd_id) : rows;
}

export async function mockGenerateHRMessage(body: { jd_id: string | null; resume_version_id: string | null; scene: HRMessage['scene']; mode: HRMessage['mode'] }): Promise<PollTask> {
  await latency();
  const runId = simulateTask('hr_message', 'hr_message', { ...body }, hrMessageScript(body.jd_id, body.resume_version_id, body.scene, body.mode));
  return running(runId);
}

export async function mockGetHRMessage(id: string): Promise<HRMessage> {
  await latency();
  const m = db().hr_messages.find((x) => x.id === id);
  if (!m) notFound(id);
  return m;
}

export async function mockPatchHRMessage(id: string, body: { content?: string }): Promise<HRMessage> {
  await latency();
  return mutate((d) => {
    const m = d.hr_messages.find((x) => x.id === id);
    if (!m) notFound(id);
    Object.assign(m, body);
    return m;
  });
}

export async function mockDeleteHRMessage(id: string): Promise<void> {
  await latency();
  mutate((d) => {
    const i = d.hr_messages.findIndex((x) => x.id === id);
    if (i < 0) notFound(id);
    d.hr_messages.splice(i, 1);
  });
}

// ── Applications（04 §5.6：状态流转 = PATCH status）────────────────
export async function mockListApplications(params?: ListParams & { status?: string }): Promise<ListResponse<Application>> {
  await latency();
  const d = db();
  const enrich = (a: Application): Application => {
    const v = a.resume_version_id ? d.resume_versions.find((x) => x.id === a.resume_version_id) : undefined;
    if (!v) return a;
    const r = d.resumes.find((x) => x.id === v.resume_id);
    return { ...a, resume_version: { id: v.id, resume_title: r?.title ?? '', version_number: v.version_number } };
  };
  let rows = [...d.applications].map(enrich);
  const statuses = params?.status ? String(params.status).split(',').filter(Boolean) : [];
  if (statuses.length) rows = rows.filter((a) => statuses.includes(a.status));
  if (params?.q) rows = rows.filter((a) => a.company.includes(params.q!) || a.position.includes(params.q!));
  rows.sort((a, b) => (b.applied_at ?? '').localeCompare(a.applied_at ?? ''));
  return paginate(rows, params);
}

export async function mockCreateApplication(body: Omit<Application, 'id' | 'created_at'>): Promise<Application> {
  await latency();
  return mutate((d) => {
    const row: Application = { ...body, id: nextId(), created_at: isoNow(), resume_version: undefined };
    d.applications.push(row);
    return row;
  });
}

export async function mockGetApplication(id: string): Promise<Application> {
  await latency();
  const a = db().applications.find((x) => x.id === id);
  if (!a) notFound(id);
  return a;
}

export async function mockPatchApplication(id: string, body: Partial<Application>): Promise<Application> {
  await latency();
  return mutate((d) => {
    const a = d.applications.find((x) => x.id === id);
    if (!a) notFound(id);
    const next = { ...a, ...body };
    // 04 §5.6：状态非待投递但无投递时间 → 422 字段级
    if (next.status !== 'to_apply' && !next.applied_at) {
      throw new ApiError(422, 'validation_error', '请补充投递时间', [{ field: 'applied_at', message: '状态已非待投递，请补充投递时间' }]);
    }
    Object.assign(a, body);
    return a;
  });
}

export async function mockDeleteApplication(id: string): Promise<void> {
  await latency();
  mutate((d) => {
    const i = d.applications.findIndex((x) => x.id === id);
    if (i < 0) notFound(id);
    d.applications.splice(i, 1);
  });
}

// ── Interview QA（04 §5.6：application_id 带出 company/position）───
export async function mockListInterviewQA(params?: { company?: string }): Promise<InterviewQA[]> {
  await latency();
  let rows = [...db().interview_qa].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (params?.company) rows = rows.filter((x) => x.company === params.company);
  return rows;
}

export async function mockCreateInterviewQA(body: Omit<InterviewQA, 'id' | 'created_at'>): Promise<InterviewQA> {
  await latency();
  return mutate((d) => {
    let row: InterviewQA = { ...body, id: nextId(), created_at: isoNow() };
    if (body.application_id) {
      const app = d.applications.find((x) => x.id === body.application_id);
      if (app) row = { ...row, company: app.company, position: app.position };
    }
    d.interview_qa.unshift(row);
    return row;
  });
}

export async function mockPatchInterviewQA(id: string, body: Partial<InterviewQA>): Promise<InterviewQA> {
  await latency();
  return mutate((d) => {
    const q = d.interview_qa.find((x) => x.id === id);
    if (!q) notFound(id);
    Object.assign(q, body);
    return q;
  });
}

export async function mockDeleteInterviewQA(id: string): Promise<void> {
  await latency();
  mutate((d) => {
    const i = d.interview_qa.findIndex((x) => x.id === id);
    if (i < 0) notFound(id);
    d.interview_qa.splice(i, 1);
  });
}

// ── Agent Runs（04 §3.3；feedback 预留 05 待确认 #4）───────────────
export async function mockGetAgentRun(id: string) {
  await latency();
  return getMockAgentRun(id) ?? (() => notFound(id))();
}

export async function mockListAgentRuns(params?: ListParams) {
  await latency();
  return paginate(db().agent_runs, params);
}

export async function mockCancelAgentRun(id: string): Promise<{ status: string }> {
  await latency();
  cancelMockTask(id);
  return { status: 'cancelled' };
}

export async function mockSendAgentRunFeedback(id: string, feedback: 'up' | 'down'): Promise<void> {
  await latency();
  mutate((d) => {
    const ar = d.agent_runs.find((a) => a.id === id);
    if (!ar) notFound(id);
    ar.feedback = feedback;
  });
}

/** 调试用：清空 Mock 数据并回到种子状态 */
export function mockReset(): void {
  localStorage.removeItem('azi-mock-db-v1');
  location.reload();
}