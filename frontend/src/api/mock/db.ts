/**
 * Mock 数据库 —— 06-frontend-design §4.5（内嵌适配器）。
 * 内存 + localStorage 持久（刷新不丢）；结构与 02-data-model 同构；
 * 鉴权/多用户不存在（04 §1 单用户模式）。
 */
import type {
  AgentRun,
  Application,
  BasicInfo,
  Education,
  Evidence,
  Experience,
  Honor,
  HRMessage,
  InterviewQA,
  JDAnalysis,
  JDMatch,
  JobDescription,
  Project,
  ProjectExpression,
  Resume,
  ResumeVersion,
  Skill,
} from '../types';

const STORAGE_KEY = 'azi-mock-db-v1';
const _seed = '__seed__';

export interface MockDB {
  seed: string;
  basic_info: BasicInfo | null;
  educations: Education[];
  experiences: Experience[];
  honors: Honor[];
  skills: Skill[];
  project_skills: { project_id: string; skill_id: string }[];
  projects: Project[];
  evidence: Evidence[];
  project_expressions: ProjectExpression[];
  job_descriptions: JobDescription[];
  jd_analyses: JDAnalysis[];
  jd_matches: JDMatch[];
  resumes: Resume[];
  resume_versions: ResumeVersion[];
  hr_messages: HRMessage[];
  applications: Application[];
  interview_qa: InterviewQA[];
  agent_runs: AgentRun[];
}

export function nextId(): string {
  return crypto.randomUUID();
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function loadDB(): MockDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDB;
      if (parsed.seed === _seed) return parsed;
    }
  } catch {
    // 损坏则重建
  }
  const fresh: MockDB = {
    seed: _seed,
    basic_info: null,
    educations: [],
    experiences: [],
    honors: [],
    skills: [],
    project_skills: [],
    projects: [],
    evidence: [],
    project_expressions: [],
    job_descriptions: [],
    jd_analyses: [],
    jd_matches: [],
    resumes: [],
    resume_versions: [],
    hr_messages: [],
    applications: [],
    interview_qa: [],
    agent_runs: [],
  };
  seedDB(fresh);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // 私密模式等场景静默降级为仅内存
  }
  return fresh;
}

let _db: MockDB | null = null;

export function db(): MockDB {
  if (!_db) _db = loadDB();
  return _db;
}

export function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_db));
  } catch {
    // ignore
  }
}

/** 变更集合的统一切口：写后即持久化 */
export function mutate<T>(fn: (d: MockDB) => T): T {
  const r = fn(db());
  persist();
  return r;
}

function seedDB(d: MockDB): void {
  const now = '2026-09-04T08:00:00Z';
  const pid = (s: string) => s;

  d.basic_info = {
    name: '张三',
    email: 'zhang.san@example.com',
    phone: '13800138000',
    github_url: 'https://github.com/zhangsan',
    homepage_url: null,
    job_role: 'AI 应用工程师',
    city: '上海',
    availability: 'within_1_week',
    self_evaluation:
      '两年 AI 应用方向研发经验，全程参与过两个从 0 到 1 的 Agent 系统：负责 LangGraph 工作流编排、RAG 检索链路与评测体系建设。\n擅长把模糊的业务需求拆解成可验证的工程方案，重视证据与量化。',
  };

  d.skills = [
    { id: pid('sk-python'), name: 'Python', proficiency: 'expert' },
    { id: pid('sk-langgraph'), name: 'LangGraph', proficiency: 'proficient' },
    { id: pid('sk-rag'), name: 'RAG', proficiency: 'proficient' },
    { id: pid('sk-fastapi'), name: 'FastAPI', proficiency: 'proficient' },
    { id: pid('sk-docker'), name: 'Docker', proficiency: 'familiar' },
    { id: pid('sk-redis'), name: 'Redis', proficiency: 'beginner' },
  ];

  const p1: Project = {
    id: pid('pr-review-agent'),
    name: 'Review-Agent',
    summary: '代码评审 Agent：基于知识库的自动化评审与意见生成',
    background: '团队代码评审耗时长、标准不一致，新人意见质量参差。',
    goal: '用私有知识库 + 检索增强的 Agent 替代人工初筛。',
    start_date: '2025-03-01',
    end_date: '2025-08-30',
    role: '核心开发',
    tech_stack: ['LangGraph', 'RAG', 'FastAPI', 'PostgreSQL'],
    responsibilities: '负责整体架构与检索链路',
    core_work: '设计并实现文档路由 + 多路召回 + 重排的检索流水线；基于 LangGraph 编排评审 Agent 的工作流；搭建批量评测集。',
    difficulties: '检索结果噪声大，召回环节平均耗时 800ms；Agent 幻觉导致评审意见不可信。',
    solutions: '引入向量 + 关键词混合召回与重排，检索耗时 800ms → 120ms；评审输出加证据引用约束与程序校验。',
    results: '评审意见采纳率提升至 78%，一次通过率提升 35%。',
    github_url: 'https://github.com/zhangsan/review-agent',
    demo_url: null,
    sort_order: 0,
    created_at: now,
  };
  const p2: Project = {
    id: pid('pr-chat-copilot'),
    name: 'Chat-Copilot',
    summary: '企业知识库对话助手',
    background: '内部文档分散，检索问答需求强烈。',
    goal: '打通多格式文档的统一问答入口。',
    start_date: '2024-09-01',
    end_date: '2025-01-15',
    role: '后端开发',
    tech_stack: ['Python', 'FastAPI', 'LLM'],
    responsibilities: '负责问答 API 与文档解析管道',
    core_work: '实现文档解析、切片与索引写入管道；封装流式问答接口。',
    difficulties: '多格式文档解析稳定性差。',
    solutions: '统一转为 Markdown 中间格式再切片。',
    results: '覆盖 6 种文档格式，问答准确率 82%。',
    github_url: null,
    demo_url: null,
    sort_order: 1,
    created_at: now,
  };
  d.projects = [p1, p2];

  d.project_skills = [
    { project_id: p1.id, skill_id: 'sk-python' },
    { project_id: p1.id, skill_id: 'sk-langgraph' },
    { project_id: p1.id, skill_id: 'sk-rag' },
    { project_id: p1.id, skill_id: 'sk-fastapi' },
    { project_id: p2.id, skill_id: 'sk-python' },
    { project_id: p2.id, skill_id: 'sk-fastapi' },
  ];

  d.evidence = [
    { id: pid('ev-1'), project_id: p1.id, type: 'github', title: 'GitHub 仓库', url: 'https://github.com/zhangsan/review-agent', note: null },
    { id: pid('ev-2'), project_id: p1.id, type: 'doc', title: '架构设计文档', url: 'https://wiki.internal/review-agent', note: '含检索链路图' },
  ];

  d.project_expressions = [
    {
      id: pid('pe-1'),
      project_id: p1.id,
      type: 'resume_bullet',
      version_number: 2,
      status: 'confirmed',
      content: {
        bullets: [
          '基于 LangGraph 构建代码评审 Agent 工作流，完成知识库检索、重排与评审生成的模块化编排，服务 3 个研发团队。',
          '设计向量 + 关键词混合召回与重排链路，将检索耗时从 800ms 降至 120ms，评审意见采纳率提升至 78%。',
        ],
      },
      created_at: now,
    },
    {
      id: pid('pe-2'),
      project_id: p1.id,
      type: 'resume_bullet',
      version_number: 1,
      status: 'draft',
      content: { bullets: ['构建了基于 RAG 的代码评审系统。'] },
      created_at: '2026-08-20T08:00:00Z',
    },
    {
      id: pid('pe-3'),
      project_id: p1.id,
      type: 'interview',
      version_number: 1,
      status: 'confirmed',
      content: {
        background: '团队代码评审耗时且标准不一，需要统一的知识底座。',
        responsibility: '负责整体架构与检索链路，主导 LangGraph 工作流编排。',
        architecture: '文档路由 → 多路召回（向量 + 关键词）→ 重排 → 证据约束生成。',
        difficulty: '检索噪声大、单次召回 800ms；幻觉导致评审不可信。',
        solution: '混合召回 + 重排，生成侧加证据引用约束与程序校验。',
        result: '检索 120ms，意见采纳率 78%，一次通过率 +35%。',
      },
      created_at: now,
    },
    {
      id: pid('pe-4'),
      project_id: p1.id,
      type: 'star',
      version_number: 1,
      status: 'draft',
      content: {
        situation: '代码评审依赖人工初筛，规模扩到 3 个团队后人力不足。',
        task: '构建自动化评审 Agent，替代人工初筛。',
        action: 'LangGraph 编排 + 混合检索 + 证据引用约束。',
        result: '采纳率 78%，初筛耗时减少 70%。',
      },
      created_at: now,
    },
  ];

  d.educations = [
    { id: pid('edu-1'), school: 'XX 大学', major: '计算机科学与技术', degree: 'master', period: '2023.09 - 2026.06', courses: '机器学习、NLP、分布式系统', sort_order: 0 },
  ];
  d.experiences = [
    { id: pid('exp-1'), type: 'research', name: '智能计算实验室', role: '研究助理', period: '2024.03 - 2025.06', description: '参与 Agent 评测体系搭建，负责检索模块性能基准。', sort_order: 0 },
  ];
  d.honors = [
    { id: pid('h-1'), name: '优秀毕业生', time: '2026 年 6 月', sort_order: 0 },
    { id: pid('h-2'), name: 'ACM-ICPC 区域赛银奖', time: '2024 年', sort_order: 1 },
  ];

  const jd1: JobDescription = {
    id: pid('jd-1'),
    title: 'AI 应用工程师',
    company: '字节跳动',
    raw_text:
      '【岗位职责】1. 负责 Agent 应用的开发与落地，参与 LLM 应用架构设计；2. 搭建 RAG 检索系统，优化文档召回与重排链路；3. 建设评测体系，持续提升模型输出质量。【任职要求】1. 3-5 年后端或 AI 应用开发经验；2. 精通 Python，熟悉 LangGraph/LangChain 等编排框架；3. 熟悉向量数据库与检索技术；4. 了解 Docker 与容器化部署；5. 本科及以上学历，有开源项目或技术博客加分。',
    created_at: now,
  };
  const jd2: JobDescription = {
    id: pid('jd-2'),
    title: 'Agent 工程师',
    company: '腾讯',
    raw_text:
      '【岗位职责】设计并实现多智能体协作系统；优化提示工程与工具调用链路；【任职要求】2 年以上 LLM 应用经验；熟练 Python 与 FastAPI；有 workflow 编排经验优先。',
    created_at: '2026-08-28T08:00:00Z',
  };
  d.job_descriptions = [jd1, jd2];

  d.jd_analyses = [
    {
      id: pid('ja-1'),
      jd_id: jd1.id,
      status: 'completed',
      title: 'AI 应用工程师',
      core_skills: [
        { name: 'Python', stars: 5 },
        { name: 'RAG', stars: 5 },
        { name: 'LangGraph', stars: 4 },
      ],
      plus_skills: [{ name: 'Docker', stars: 3 }],
      responsibilities: ['Agent 应用开发', 'RAG 系统建设', '评测体系'],
      experience_requirement: '3-5 年',
      education_requirement: '本科及以上',
      keywords: ['Agent', 'RAG', 'LangGraph', '评测'],
    },
    {
      id: pid('ja-2'),
      jd_id: jd2.id,
      status: 'completed',
      title: 'Agent 工程师',
      core_skills: [
        { name: 'Python', stars: 5 },
        { name: 'FastAPI', stars: 4 },
      ],
      plus_skills: [],
      responsibilities: ['多智能体系统', '提示工程'],
      experience_requirement: '2 年以上',
      education_requirement: '本科及以上',
      keywords: ['Agent', 'workflow'],
    },
  ];

  d.jd_matches = [
    {
      id: pid('jm-1'),
      jd_id: jd1.id,
      overall_score: 87,
      skill_matches: [
        { name: 'Python', status: 'strong' },
        { name: 'RAG', status: 'strong' },
        { name: 'LangGraph', status: 'strong' },
        { name: 'Docker', status: 'partial' },
        { name: 'Redis', status: 'missing' },
      ],
      matched_project_ids: [p1.id, p2.id],
      advantages: ['有完整 Agent 项目', '有 RAG 实践'],
      gaps: ['缺少 Redis 实践', '缺少生产级部署案例'],
      created_at: now,
    },
    {
      id: pid('jm-2'),
      jd_id: jd1.id,
      overall_score: 82,
      skill_matches: [
        { name: 'Python', status: 'strong' },
        { name: 'RAG', status: 'partial' },
        { name: 'LangGraph', status: 'partial' },
      ],
      matched_project_ids: [p1.id],
      advantages: ['有 Agent 项目'],
      gaps: ['缺少 RAG 生产实践'],
      created_at: '2026-08-20T08:00:00Z',
    },
  ];

  const r1: Resume = { id: pid('res-1'), title: 'AI 应用工程师', target_role: 'AI 应用工程师', template: 'classic', created_at: now };
  const r2: Resume = { id: pid('res-2'), title: 'Agent 工程师', target_role: 'Agent 工程师', template: 'modern', created_at: now };
  d.resumes = [r1, r2];

  d.resume_versions = [
    {
      id: pid('rv-1'),
      resume_id: r1.id,
      version_number: 3,
      content: seedContent('AI 应用工程师', '总部在上海', [
        {
          name: 'Review-Agent', period: '2025.03 - 2025.08', role: '核心开发',
          tech_stack: ['LangGraph', 'RAG', 'FastAPI', 'PostgreSQL'],
          bullets: [
            '基于 LangGraph 构建代码评审 Agent 工作流，完成知识库检索、重排与评审生成的模块化编排，服务 3 个研发团队。',
            '设计向量 + 关键词混合召回与重排链路，召回性能提升 50%，评审意见采纳率提升至 78%。',
          ],
          github: 'https://github.com/zhangsan/review-agent', demo: null,
        },
      ]),
      reflection_status: 'pending',
      reflection_result: null,
      confirmed_at: null,
      updated_at: now,
      created_at: now,
    },
    {
      id: pid('rv-2'),
      resume_id: r1.id,
      version_number: 2,
      content: seedContent('AI 应用工程师', '上海', [
        {
          name: 'Review-Agent', period: '2025.03 - 2025.08', role: '核心开发',
          tech_stack: ['LangGraph', 'RAG', 'FastAPI'],
          bullets: [
            '基于 LangGraph 构建代码评审 Agent 工作流，完成检索、重排与评审生成的模块化编排。',
            '设计混合召回与重排链路，将检索耗时从 800ms 降至 120ms，评审意见采纳率提升至 78%。',
          ],
          github: 'https://github.com/zhangsan/review-agent', demo: null,
        },
        {
          name: 'Chat-Copilot', period: '2024.09 - 2025.01', role: '后端开发',
          tech_stack: ['Python', 'FastAPI', 'LLM'],
          bullets: ['实现企业知识库问答系统，覆盖 6 种文档格式，问答准确率 82%。'],
          github: null, demo: null,
        },
      ]),
      reflection_status: 'passed',
      reflection_result: {
        match_score: 84,
        coverage: { hit_keywords: ['RAG', 'Agent', 'LangGraph'], missing_keywords: ['Docker'] },
        fabrication: { passed: true, issues: [] },
      },
      confirmed_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
      created_at: '2026-09-01T09:00:00Z',
    },
    {
      id: pid('rv-3'),
      resume_id: r2.id,
      version_number: 1,
      content: seedContent('Agent 工程师', '上海', [
        {
          name: 'Review-Agent', period: '2025.03 - 2025.08', role: '核心开发',
          tech_stack: ['LangGraph', 'RAG', 'FastAPI'],
          bullets: ['LangGraph 编排评审 Agent，建设评测集与证据引用约束，采纳率 78%。'],
          github: 'https://github.com/zhangsan/review-agent', demo: null,
        },
      ]),
      reflection_status: 'pending',
      reflection_result: null,
      confirmed_at: null,
      updated_at: now,
      created_at: now,
    },
  ];

  d.hr_messages = [
    {
      id: pid('hm-1'),
      jd_id: jd1.id,
      resume_version_id: 'rv-2',
      scene: 'boss_zhipin',
      mode: 'short',
      content: '您好，我是张三，两年 AI 应用方向研发经验。做过 Review-Agent（LangGraph + RAG，检索 800ms→120ms），和贵司该岗位的 Agent 应用开发方向很匹配，方便聊聊吗？',
      created_at: now,
    },
  ];

  d.applications = [
    { id: pid('ap-1'), company: '字节跳动', position: 'AI 应用工程师', status: 'replied', applied_at: '2026-09-01', resume_version_id: 'rv-2', note: '等一面', created_at: now },
    { id: pid('ap-2'), company: '腾讯', position: 'Agent 工程师', status: 'interview', applied_at: '2026-09-02', resume_version_id: 'rv-3', note: null, created_at: now },
    { id: pid('ap-3'), company: '快手', position: '后端开发', status: 'offer', applied_at: '2026-09-03', resume_version_id: null, note: null, created_at: now },
    { id: pid('ap-4'), company: '美团', position: '大模型应用工程师', status: 'to_apply', applied_at: null, resume_version_id: null, note: null, created_at: now },
    { id: pid('ap-5'), company: '百度', position: 'AI 应用开发', status: 'applied', applied_at: '2026-09-04', resume_version_id: 'rv-1', note: null, created_at: now },
  ];

  d.interview_qa = [
    { id: pid('iq-1'), application_id: 'ap-2', company: '腾讯', position: 'Agent 工程师', interview_at: '2026-09-02', question: '介绍一下你做的 Agent 系统架构？', answer: '以 Review-Agent 为例：文档路由 → 混合召回 → 重排 → 证据约束生成，LangGraph 编排整个工作流。', note: '检索性能讲得不错', created_at: now },
    { id: pid('iq-2'), application_id: null, company: '字节跳动', position: 'AI 应用工程师', interview_at: '2026-09-05', question: 'RAG 检索效果不好怎么排查？', answer: '', note: '待复盘', created_at: now },
  ];

  d.agent_runs = [
    {
      id: pid('ar-1'),
      agent_type: 'jd_analyze',
      prompt_name: 'jd_analyze',
      status: 'completed',
      input_refs: { jd_id: jd1.id },
      output_refs: { jd_analysis_id: 'ja-1' },
      tokens: 4211,
      latency_ms: 18300,
      error: null,
      feedback: null,
      created_at: now,
    },
  ];
}

interface ResumeContentShape {
  schema_version: number;
  basic_info: { name: string; email: string; phone: string; github: string | null; homepage: string | null };
  job_intention: { role: string; city: string; availability: 'within_1_week' };
  education: { school: string; major: string; degree: 'master'; period: string; courses: string }[];
  research: { name: string; role: string; period: string; description: string }[];
  campus: { name: string; role: string; period: string; description: string }[];
  projects: { name: string; period: string; role: string; tech_stack: string[]; bullets: string[]; github: string | null; demo: string | null }[];
  honors: { name: string; time: string }[];
  skills: { name: string; proficiency: 'expert' | 'proficient' | 'familiar' | 'beginner' }[];
  self_evaluation: string;
}

function seedContent(
  role: string,
  city: string,
  projects: ResumeContentShape['projects'],
): ResumeContentShape {
  return {
    schema_version: 1,
    basic_info: {
      name: '张三',
      email: 'zhang.san@example.com',
      phone: '13800138000',
      github: 'https://github.com/zhangsan',
      homepage: null,
    },
    job_intention: { role, city, availability: 'within_1_week' },
    education: [{ school: 'XX 大学', major: '计算机科学与技术', degree: 'master', period: '2023.09 - 2026.06', courses: '机器学习、NLP' }],
    research: [{ name: '智能计算实验室', role: '研究助理', period: '2024.03 - 2025.06', description: '参与 Agent 评测体系搭建，负责检索模块性能基准。' }],
    campus: [],
    projects,
    honors: [
      { name: '优秀毕业生', time: '2026 年 6 月' },
      { name: 'ACM-ICPC 区域赛银奖', time: '2024 年' },
    ],
    skills: [
      { name: 'Python', proficiency: 'expert' },
      { name: 'LangGraph', proficiency: 'proficient' },
      { name: 'RAG', proficiency: 'proficient' },
      { name: 'FastAPI', proficiency: 'proficient' },
      { name: 'Docker', proficiency: 'familiar' },
    ],
    self_evaluation:
      '两年 AI 应用方向研发经验，全程参与过两个从 0 到 1 的 Agent 系统：负责 LangGraph 工作流编排、RAG 检索链路与评测体系建设。擅长把模糊的业务需求拆解成可验证的工程方案，重视证据与量化。',
  };
}