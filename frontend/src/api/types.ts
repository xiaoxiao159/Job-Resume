/**
 * 类型契约 —— 同源于 02-data-model §5/§6 与 04-api-design §5。
 * 规则（06-frontend-design §4.2）：snake_case 直传、不扩展、不改名；
 * 字段增删只发生在 02 文档，本文件随其升版。
 */

// ── 02 §5 枚举 ────────────────────────────────────────────────────
export type Availability = 'immediate' | 'within_1_week' | 'within_2_weeks' | 'within_1_month' | 'undecided';
export type Degree = 'bachelor' | 'master' | 'phd';
export type ExperienceType = 'research' | 'campus';
export type Proficiency = 'beginner' | 'familiar' | 'proficient' | 'expert';
export type EvidenceType = 'github' | 'code' | 'doc' | 'experiment' | 'screenshot' | 'demo' | 'paper' | 'other';
export type ExpressionType = 'resume_bullet' | 'interview' | 'star';
export type ExpressionStatus = 'draft' | 'confirmed';
export type AnalysisStatus = 'processing' | 'completed' | 'failed';
export type SkillMatchStatus = 'strong' | 'partial' | 'missing';
export type ResumeTemplate = 'classic' | 'modern' | 'minimal';
export type ReflectionStatus = 'pending' | 'passed' | 'issues';
export type HrScene = 'boss_zhipin' | 'wechat' | 'email' | 'linkedin';
export type HrMode = 'short' | 'standard' | 'technical';
export type ApplicationStatus = 'to_apply' | 'applied' | 'replied' | 'interview' | 'offer' | 'rejected' | 'no_response';
export type AgentRunStatus = 'running' | 'completed' | 'failed';
export type AgentType = 'jd_analyze' | 'jd_match' | 'project_expression' | 'resume_generate' | 'reflection' | 'hr_message' | 'asset_assist' | 'polish_self_eval';

// ── 04 §2.2/§2.3 通用结构 ─────────────────────────────────────────
export interface PageMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: PageMeta;
}

export interface ListParams {
  page?: number;
  per_page?: number;
  q?: string;
  sort?: string;
}

/** 04 §3 统一任务协议 */
export interface PollTask {
  agent_run_id: string;
  status: AgentRunStatus;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── 资产（02 §4 / 04 §5.2）────────────────────────────────────────
export interface BasicInfo {
  name: string;
  email: string;
  phone: string;
  github_url: string | null;
  homepage_url: string | null;
  job_role: string;
  city: string;
  availability: Availability;
  self_evaluation: string;
}

export interface Education {
  id: string;
  school: string;
  major: string;
  degree: Degree;
  period: string;
  courses: string;
  sort_order: number;
}

export interface Experience {
  id: string;
  type: ExperienceType;
  name: string;
  role: string;
  period: string;
  description: string;
  sort_order: number;
}

export interface Honor {
  id: string;
  name: string;
  time: string;
  sort_order: number;
}

export interface Skill {
  id: string;
  name: string;
  proficiency: Proficiency;
}

export interface ProjectSkill extends Skill {
  // project_skills 关联结果（04 §5.2）
}

export interface Evidence {
  id: string;
  project_id: string;
  type: EvidenceType;
  title: string;
  url: string;
  note: string | null;
}

export interface Project {
  id: string;
  name: string;
  summary: string;
  background: string;
  goal: string;
  start_date: string;
  end_date: string;
  role: string;
  tech_stack: string[];
  responsibilities: string;
  core_work: string;
  difficulties: string;
  solutions: string;
  results: string;
  github_url: string | null;
  demo_url: string | null;
  sort_order: number;
  created_at: string;
}

/** 02 §6.3：content 随 expression_type 三态联合 */
export type ProjectExpressionContent =
  | { bullets: string[] }
  | { background: string; responsibility: string; architecture: string; difficulty: string; solution: string; result: string }
  | { situation: string; task: string; action: string; result: string };

export interface ProjectExpression {
  id: string;
  project_id: string;
  type: ExpressionType;
  version_number: number;
  status: ExpressionStatus;
  content: ProjectExpressionContent;
  created_at: string;
}

// ── JD（02 §4.11–§4.13 / 04 §5.3）────────────────────────────────
export interface JobDescription {
  id: string;
  title: string;
  company: string;
  raw_text: string;
  created_at: string;
}

export interface JdSkillItem {
  name: string;
  stars: number;
}

/** 02 §6.2 岗位画像 */
export interface JDAnalysis {
  id: string;
  jd_id: string;
  status: AnalysisStatus;
  title: string;
  core_skills: JdSkillItem[];
  plus_skills: JdSkillItem[];
  responsibilities: string[];
  experience_requirement: string;
  education_requirement: string;
  keywords: string[];
}

/** 02 §6.4 匹配结果 */
export interface JDMatch {
  id: string;
  jd_id: string;
  overall_score: number;
  skill_matches: { name: string; status: SkillMatchStatus }[];
  matched_project_ids: string[];
  advantages: string[];
  gaps: string[];
  created_at: string;
}

// ── 简历（02 §4.14–§4.15 / 04 §5.4）──────────────────────────────
export interface Resume {
  id: string;
  title: string;
  target_role: string;
  template: ResumeTemplate | null;
  created_at: string;
}

/** 02 §6.1 简历 8 段快照 */
export interface ResumeContent {
  schema_version: number;
  basic_info: { name: string; email: string; phone: string; github: string | null; homepage: string | null };
  job_intention: { role: string; city: string; availability: Availability };
  education: { school: string; major: string; degree: Degree; period: string; courses: string }[];
  research: AssetRow[];
  campus: AssetRow[];
  projects: {
    name: string;
    period: string;
    role: string;
    tech_stack: string[];
    bullets: string[];
    github: string | null;
    demo: string | null;
  }[];
  honors: { name: string; time: string }[];
  skills: { name: string; proficiency: Proficiency }[];
  self_evaluation: string;
}

export interface AssetRow {
  name: string;
  role: string;
  period: string;
  description: string;
}

/** 02 §6.5 Reflection 结果 */
export interface ReflectionResult {
  match_score: number;
  coverage: { hit_keywords: string[]; missing_keywords: string[] };
  fabrication: {
    passed: boolean;
    issues: { location: string; claim: string; type: string }[];
  };
}

export interface ResumeVersion {
  id: string;
  resume_id: string;
  version_number: number;
  content: ResumeContent;
  reflection_status: ReflectionStatus;
  reflection_result: ReflectionResult | null;
  confirmed_at: string | null;
  updated_at: string;
  created_at: string;
}

// ── HR / 投递 / 面试（04 §5.5–§5.6）───────────────────────────────
export interface HRMessage {
  id: string;
  jd_id: string | null;
  resume_version_id: string | null;
  scene: HrScene;
  mode: HrMode;
  content: string;
  created_at: string;
}

export interface Application {
  id: string;
  company: string;
  position: string;
  status: ApplicationStatus;
  applied_at: string | null;
  resume_version_id: string | null;
  note: string | null;
  created_at: string;
  /** dashboard 最近投递携带的简历版本摘要（04 §5.1） */
  resume_version?: { id: string; resume_title: string; version_number: number } | null;
}

export interface InterviewQA {
  id: string;
  application_id: string | null;
  company: string;
  position: string;
  interview_at: string;
  question: string;
  answer: string;
  note: string | null;
  created_at: string;
}

// ── Agent 日志（04 §3.3；feedback 列待 02 升版，05 待确认 #4）──
export interface AgentRun {
  id: string;
  agent_type: AgentType;
  prompt_name: string;
  status: AgentRunStatus;
  input_refs: Record<string, unknown> | null;
  output_refs: Record<string, unknown> | null;
  tokens: number | null;
  latency_ms: number | null;
  error: { code: string; message: string } | null;
  feedback: 'up' | 'down' | null;
  created_at: string;
}

// ── Dashboard（04 §5.1）───────────────────────────────────────────
export interface DashboardData {
  stats: { applied: number; replied: number; interview: number; offer: number; reply_rate: number };
  asset_progress: { basic_info: boolean; projects_count: number; skills_count: number; education_count: number };
  recent_applications: Application[];
}

// ── 05 §4.7 回填建议字段 ──────────────────────────────────────────
export interface RefillFields {
  background: string;
  goal: string;
  responsibilities: string;
  core_work: string;
  difficulties: string;
  solutions: string;
  results: string;
}

export interface QuestionnaireAnswer {
  question: string;
  answer: string;
}