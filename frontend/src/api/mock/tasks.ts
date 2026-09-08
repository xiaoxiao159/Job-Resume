/**
 * Mock 任务仿真引擎 —— 06-frontend-design §4.5。
 * 模拟 04 §3 统一任务协议：触发（simulateTask 返回 agent_run_id）
 * → 状态/思考 stage → chunk* → done(refs/result)；支持取消与事件缓冲重放。
 * 对订阅方（sse.ts / useAgentTask）与真实后端事件协议完全一致。
 */
import type { AgentEvent } from '../sse';
import type { AgentRun, AgentType, ChatMessage, HRMessage, HrMode, HrScene, ResumeContent } from '../types';
import { db, isoNow, mutate, nextId } from './db';
import { buildResumeMarkdown } from '../../lib/resume-render';

// ── 运行时状态 ────────────────────────────────────────────────────
interface ActiveTask {
  run: AgentRun;
  cancelled: boolean;
}
const active = new Map<string, ActiveTask>();
/** 事件缓冲：完成 + 24h 语义的简化（内存存活即可），订阅时重放（幂等，靠 seq 去重） */
const eventLogs = new Map<string, (AgentEvent & { seq: number })[]>();
const listeners = new Map<string, Set<(e: AgentEvent) => void>>();

let seqCounter = 0;

class Cancelled extends Error {}

export interface TaskCtx {
  emit(e: AgentEvent): void;
  /** 睡 ms；若任务被取消则抛 Cancelled 终止脚本 */
  sleep(ms: number): Promise<void>;
}

function makeCtx(id: string): TaskCtx {
  return {
    emit(e) {
      const ev = { ...e, seq: ++seqCounter };
      const log = eventLogs.get(id) ?? [];
      log.push(ev);
      eventLogs.set(id, log);
      listeners.get(id)?.forEach((l) => l(e));
    },
    async sleep(ms) {
      await new Promise((r) => setTimeout(r, ms));
      if (active.get(id)?.cancelled) throw new Cancelled();
    },
  };
}

type Script = (ctx: TaskCtx) => Promise<{ refs?: Record<string, string>; result?: unknown } | void>;

export function simulateTask(
  agentType: AgentType,
  promptName: string,
  inputRefs: Record<string, unknown>,
  script: Script,
): string {
  const id = nextId();
  const run: AgentRun = {
    id,
    agent_type: agentType,
    prompt_name: promptName,
    status: 'running',
    input_refs: inputRefs,
    output_refs: null,
    tokens: null,
    latency_ms: null,
    error: null,
    feedback: null,
    created_at: isoNow(),
  };
  mutate((d) => d.agent_runs.unshift(run));
  active.set(id, { run, cancelled: false });
  void exec(id, script);
  return id;
}

async function exec(id: string, script: Script): Promise<void> {
  const t = active.get(id);
  if (!t) return;
  const ctx = makeCtx(id);
  const started = Date.now();
  try {
    ctx.emit({ type: 'status', status: 'running' });
    await ctx.sleep(400);
    const out = await script(ctx);
    const latency = Date.now() - started;
    mutate((d) => {
      const ar = d.agent_runs.find((a) => a.id === id);
      if (ar) {
        ar.status = 'completed';
        ar.output_refs = (out?.refs as Record<string, unknown> | null) ?? {};
        ar.tokens = 600 + Math.floor(latency / 20) * 5;
        ar.latency_ms = latency;
      }
    });
    ctx.emit({ type: 'done', refs: out?.refs ?? {}, result: out?.result });
  } catch (e) {
    const cancelled = e instanceof Cancelled || active.get(id)?.cancelled;
    const error = cancelled
      ? { code: 'cancelled', message: '任务已取消' }
      : { code: 'llm_error', message: 'LLM 上游返回异常（Mock 注入失败）' };
    mutate((d) => {
      const ar = d.agent_runs.find((a) => a.id === id);
      if (ar) {
        ar.status = 'failed';
        ar.error = error;
        ar.latency_ms = Date.now() - started;
      }
    });
    ctx.emit({ type: 'error', ...error });
  } finally {
    active.delete(id);
    // 完成后保留事件缓冲供「先查后听」的场景重放（06 §4.4）
  }
}

export function subscribeMockTask(runId: string, onEvent: (e: AgentEvent) => void): () => void {
  for (const e of eventLogs.get(runId) ?? []) onEvent(e);
  let set = listeners.get(runId);
  if (!set) {
    set = new Set();
    listeners.set(runId, set);
  }
  set.add(onEvent);
  return () => set.delete(onEvent);
}

export function cancelMockTask(runId: string): void {
  const t = active.get(runId);
  if (t) t.cancelled = true;
}

export function getMockAgentRun(runId: string): AgentRun | undefined {
  return db().agent_runs.find((a) => a.id === runId);
}

// ── 仿真脚本（chunk 文本 + 落库组装，镜像 05 各 Agent 的行为）──────

function fmtPeriod(start: string, end: string): string {
  const f = (s: string) => s.slice(0, 7).replace('-', '.');
  return `${f(start)} - ${f(end)}`;
}

/** 05 §4.4 装配分工：事实段程序拷贝、认知段组装（Mock 版） */
export function assembleResumeContent(
  role: string,
  city: string,
  withConfirmedOnly = false,
): ResumeContent {
  const d = db();
  const bi = d.basic_info;
  const availability = bi?.availability ?? ('within_1_week' as const);
  const projects = d.projects
    .map((p) => {
      const confirmed = withConfirmedOnly
        ? d.project_expressions.filter(
            (e) => e.project_id === p.id && e.type === 'resume_bullet' && e.status === 'confirmed',
          )
        : [];
      const latestBullets =
        confirmed.length && 'bullets' in confirmed[0].content ? confirmed[0].content.bullets : null;
      const bullets =
        latestBullets ?? [
          p.core_work || p.summary || p.goal,
          [p.solutions, p.results].filter(Boolean).join('，'),
        ].filter((b) => b && b.trim().length > 0);
      return {
        name: p.name,
        period: fmtPeriod(p.start_date, p.end_date),
        role: p.role,
        tech_stack: p.tech_stack,
        bullets,
        github: p.github_url,
        demo: p.demo_url,
      };
    })
    .filter((p) => p.bullets.length > 0);

  const order: Record<'beginner' | 'familiar' | 'proficient' | 'expert', number> = {
    expert: 0,
    proficient: 1,
    familiar: 2,
    beginner: 3,
  };
  const skills = [...d.skills]
    .sort((a, b) => order[a.proficiency] - order[b.proficiency])
    .map((s) => ({ name: s.name, proficiency: s.proficiency }));

  return {
    schema_version: 1,
    basic_info: {
      name: bi?.name ?? '未命名',
      email: bi?.email ?? '',
      phone: bi?.phone ?? '',
      github: bi?.github_url ?? null,
      homepage: bi?.homepage_url ?? null,
    },
    job_intention: { role, city: city || bi?.city || '', availability },
    education: d.educations.map((e) => ({
      school: e.school,
      major: e.major,
      degree: e.degree,
      period: e.period,
      courses: e.courses,
    })),
    research: d.experiences
      .filter((e) => e.type === 'research')
      .map((e) => ({ name: e.name, role: e.role, period: e.period, description: e.description })),
    campus: d.experiences
      .filter((e) => e.type === 'campus')
      .map((e) => ({ name: e.name, role: e.role, period: e.period, description: e.description })),
    projects,
    honors: d.honors.map((h) => ({ name: h.name, time: h.time })),
    skills,
    self_evaluation: bi?.self_evaluation ?? '',
  };
}

// ── 各任务脚本工厂 ────────────────────────────────────────────────

export function jdAnalyzeScript(jdId: string) {
  return async (ctx: TaskCtx) => {
    const d = db();
    const jd = d.job_descriptions.find((x) => x.id === jdId);
    if (!jd) throw new Error('jd not found');
    const raw = jd.raw_text;

    // 简易关键词画像（Mock 版 JD Agent）
    const rankDefs: Record<string, number> = {
      Python: 5, RAG: 5, LangGraph: 4, LangChain: 4, FastAPI: 4,
      PyTorch: 3, Docker: 3, PostgreSQL: 3, Redis: 2, Kubernetes: 2,
    };
    const found = Object.entries(rankDefs)
      .filter(([kw]) => raw.includes(kw))
      .map(([name, stars]) => ({ name, stars }));
    const core = found.filter((x) => x.stars >= 4).slice(0, 3);
    const plus = found.filter((x) => x.stars < 4).slice(0, 2);
    if (!core.length) core.push({ name: 'Python', stars: 5 });

    const responsibilities = raw
      .split(/[；;。\n]/)
      .map((s) => s.trim())
      .filter((s) => /负责|建设|研发|开发/.test(s))
      .slice(0, 3);

    const kws = ['Agent', 'RAG', 'LLM', '评测'].filter((k) => raw.includes(k));
    for (const f of found) if (!kws.includes(f.name)) kws.push(f.name);

    const lines: string[] = [
      `岗位名称：${jd.title || '未知岗位'}`,
      '',
      '核心技能：',
      ...core.map((x) => `${'★'.repeat(x.stars)}${'☆'.repeat(5 - x.stars)} ${x.name}`),
      ...(plus.length ? ['', '加分项：', ...plus.map((x) => `★${'☆'.repeat(4)} ${x.name}`)] : []),
      '',
      '岗位职责：',
      ...responsibilities,
      '',
      `关键词：${kws.slice(0, 6).join('、')}`,
      `经验要求：${/3-5|三年|五年/.test(raw) ? '3-5 年' : '2 年以上'}`,
    ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '');

    for (const [i, part] of lines.entries()) {
      ctx.emit({ type: 'chunk', text: part + '\n' });
      if (i < lines.length - 1) await ctx.sleep(120 + (i % 3) * 90);
    }

    const analysis = {
      id: nextId(),
      jd_id: jdId,
      status: 'completed' as const,
      title: jd.title,
      core_skills: core,
      plus_skills: plus,
      responsibilities,
      experience_requirement: /3-5|三年/.test(raw) ? '3-5 年' : '2 年以上',
      education_requirement: '本科及以上',
      keywords: kws.slice(0, 6),
    };
    mutate((d) => {
      d.jd_analyses = d.jd_analyses.filter((a) => a.jd_id !== jdId);
      d.jd_analyses.push(analysis);
    });
    return { refs: { jd_analysis_id: analysis.id } };
  };
}

export function jdMatchScript(jdId: string) {
  return async (ctx: TaskCtx) => {
    const d = db();
    const analysis = d.jd_analyses.find((a) => a.jd_id === jdId);
    const jd = d.job_descriptions.find((x) => x.id === jdId);
    if (!jd) throw new Error('jd not found');
    const core: { name: string; stars: number }[] = analysis?.core_skills ?? [{ name: 'Python', stars: 5 }];
    const allSkills = [...core, ...(analysis?.plus_skills ?? [])];
    const userSkillNames = new Set(d.skills.map((s) => s.name));
    const techNames = new Set(d.projects.flatMap((p) => p.tech_stack));

    const skill_matches = allSkills.map((s) => {
      let status: 'strong' | 'partial' | 'missing' = 'missing';
      const us = d.skills.find((k) => k.name === s.name);
      if (us) status = us.proficiency === 'expert' || us.proficiency === 'proficient' ? 'strong' : 'partial';
      else if (techNames.has(s.name)) status = 'partial';
      return { name: s.name, status };
    });
    const s = (st: string) => (st === 'strong' ? 1 : st === 'partial' ? 0.5 : 0);
    const starSum = allSkills.reduce((a, x) => a + x.stars, 0) || 1;
    const overall_score = Math.round((100 * allSkills.reduce((a, x, i) => a + x.stars * s(skill_matches[i].status), 0)) / starSum);

    const matched_project_ids = d.projects
      .filter((p) => p.tech_stack.some((t) => core.some((c) => c.name === t) || (analysis?.keywords ?? []).some((k) => p.summary.includes(k.toUpperCase()))))
      .map((p) => p.id);

    ctx.emit({ type: 'chunk', text: `正在基于资产库核对 ${allSkills.length} 项技能要求……\n` });
    await ctx.sleep(700);
    ctx.emit({ type: 'chunk', text: `匹配计算完成，总体匹配度 ${overall_score}%\n` });
    await ctx.sleep(300);

    const match = {
      id: nextId(),
      jd_id: jdId,
      overall_score,
      skill_matches,
      matched_project_ids,
      advantages: matched_project_ids.length ? [`有 ${matched_project_ids.length} 个相关项目可支撑`] : ['基础技能扎实'],
      gaps: skill_matches.filter((x) => x.status !== 'strong').map((x) => (x.status === 'missing' ? `缺少 ${x.name} 实践` : `${x.name} 熟练度可加强`)),
      created_at: isoNow(),
    };
    mutate((d) => d.jd_matches.unshift(match));
    return { refs: { jd_match_id: match.id } };
  };
}

export function expressionScript(projectId: string, type: 'resume_bullet' | 'interview' | 'star') {
  return async (ctx: TaskCtx) => {
    const d = db();
    const p = d.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('project not found');
    const label = type === 'resume_bullet' ? '简历版' : type === 'interview' ? '面试版' : 'STAR 版';
    ctx.emit({ type: 'chunk', text: `正在为「${p.name}」生成${label}表达……\n` });
    await ctx.sleep(600);

    const content =
      type === 'resume_bullet'
        ? {
            bullets: [
              p.core_work || p.summary,
              [p.solutions, p.results].filter(Boolean).join('，'),
            ].filter((b) => b && b.trim().length > 0),
          }
        : type === 'interview'
          ? {
              background: p.background,
              responsibility: p.responsibilities,
              architecture: p.core_work,
              difficulty: p.difficulties,
              solution: p.solutions,
              result: p.results,
            }
          : {
              situation: p.background,
              task: p.goal,
              action: p.core_work,
              result: p.results,
            };

    const lines: string[] = 'bullets' in content ? (content.bullets ?? []) : Object.values(content);
    for (const line of lines) {
      if (typeof line === 'string' && line) {
        ctx.emit({ type: 'chunk', text: `${line}\n` });
        await ctx.sleep(400);
      }
    }

    const version =
      Math.max(0, ...d.project_expressions.filter((e) => e.project_id === projectId && e.type === type).map((e) => e.version_number)) + 1;
    const expr = {
      id: nextId(),
      project_id: projectId,
      type,
      version_number: version,
      status: 'draft' as const,
      content,
      created_at: isoNow(),
    };
    mutate((d) => d.project_expressions.push(expr));
    return { refs: { project_expression_id: expr.id } };
  };
}

export function questionnaireScript(projectId: string, answers: { question: string; answer: string }[]) {
  return async (ctx: TaskCtx) => {
    const d = db();
    const p = d.projects.find((x) => x.id === projectId);
    ctx.emit({ type: 'chunk', text: `已收到 ${answers.length} 组问答，正在定位薄弱字段……\n` });
    await ctx.sleep(500);
    const weakest = !p?.difficulties ? '难点与成果' : !p?.responsibilities ? '我的工作' : '背景与目标';
    const last = answers[answers.length - 1]?.answer ?? '';
    const followUp = last.length > 10
      ? `你提到「${last.slice(0, 24)}${last.length > 24 ? '…' : ''}」，这部分目前信息最薄。当时遇到的具体阻碍是什么？最后怎么验证做成了？`
      : `「${weakest}」这一组目前信息最薄弱：当时遇到的具体阻碍是什么？最终成果有没有可量化的数字？`;
    for (const part of [followUp.slice(0, 30), followUp.slice(30)]) {
      if (part) {
        ctx.emit({ type: 'chunk', text: part });
        await ctx.sleep(380);
      }
    }
    return { refs: {}, result: { follow_up: followUp } };
  };
}

const CHAT_REPLIES = [
  (last: string) =>
    last.includes('性能') || last.includes('慢') || last.includes('耗时')
      ? '检索性能是常见难点——当时瓶颈定位在哪个环节？是向量召回、文档解析还是网络序列化？有没有用 benchmark 对比优化前后的数据？'
      : `明白。再深挖一层：这部分工作里你个人独立完成的部分是什么？如果用一个数字衡量它的价值，会是什么？`,
  (last: string) =>
    `很好。接着问一个「为什么难」：${last.includes('性能') ? '这个优化如果不做，业务会怎样？' : '评审采纳率能提升，最关键的一步是什么？'}`,
  (last: string) =>
    `最后一个问题：如果现在重做一遍，你会怎么改进这个方案？这能体现你的复盘深度。`,
];

export function chatScript(projectId: string, messages: ChatMessage[]) {
  return async (ctx: TaskCtx) => {
    const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const turnCount = messages.filter((m) => m.role === 'user').length - 1;
    const reply = CHAT_REPLIES[Math.min(turnCount, CHAT_REPLIES.length - 1)](last);
    for (const part of [reply.slice(0, 26), reply.slice(26, 52), reply.slice(52)]) {
      if (part) {
        ctx.emit({ type: 'chunk', text: part });
        await ctx.sleep(260);
      }
    }
    return { refs: {} };
  };
}

export function refillScript(projectId: string, _messages: ChatMessage[]) {
  return async (ctx: TaskCtx) => {
    const d = db();
    const p = d.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('project not found');
    ctx.emit({ type: 'chunk', text: '正在提炼对话要点并写回表单字段……\n' });
    await ctx.sleep(800);
    const refine = (v: string) => `${v}（结合复盘补充了量化与验证细节）`;
    const fields = {
      background: refine(p.background || '（本次对话未覆盖，请在表单中补充）'),
      goal: refine(p.goal || '（本次对话未覆盖，请在表单中补充）'),
      responsibilities: refine(p.responsibilities),
      core_work: refine(p.core_work),
      difficulties: refine(p.difficulties),
      solutions: refine(p.solutions),
      results: refine(p.results),
    };
    return { refs: {}, result: { fields } };
  };
}

export function polishSelfEvalScript() {
  return async (ctx: TaskCtx) => {
    const d = db();
    const bi = d.basic_info;
    const base = bi?.self_evaluation ?? '';
    const suggestion =
      base.trim().length > 0
        ? `（润色仅改写表达，未新增事实）\n${base
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .join(' ')
            .replace(/，/g, '，\n')}`
        : '两年足量 AI 应用研发经验候选人：可按「方向 + 代表项目 + 量化成果 + 工程方法论」四句结构引导式填写。';
    for (const part of [suggestion.slice(0, 40), suggestion.slice(40, 80), suggestion.slice(80)]) {
      if (part) {
        ctx.emit({ type: 'chunk', text: part });
        await ctx.sleep(280);
      }
    }
    return { refs: {}, result: { self_evaluation: suggestion.replace(/^（润色仅改写表达，未新增事实）\n/, '') } };
  };
}

export function hrMessageScript(jdId: string | null, resumeVersionId: string | null, scene: HrScene, mode: HrMode) {
  return async (ctx: TaskCtx) => {
    const d = db();
    const jd = d.job_descriptions.find((x) => x.id === jdId) ?? null;
    const ver = d.resume_versions.find((x) => x.id === resumeVersionId) ?? null;
    const c = ver?.content;
    const name = c?.basic_info.name ?? '张三';
    const project = c?.projects[0];
    const tech = project?.tech_stack.slice(0, 3).join('、') ?? 'Agent 应用';

    const body =
      mode === 'technical'
        ? `您好，我是${name}，${c?.job_intention.role ?? 'AI 应用'}方向。在${project?.name ?? 'Agent 项目'}中独立完成 LangGraph 工作流编排与 RAG 检索链路，检索耗时从 800ms 优化到 120ms，评审意见采纳率 78%。这与贵司${jd?.title ?? '该岗位'}的 Agent 应用开发要求高度吻合，期待与您深入聊一次。`
        : `您好，我是${name}，两年 AI 应用方向研发经验，做过${project?.name ?? 'Agent 项目'}（${tech}），和贵司${jd?.title ?? '该岗位'}岗位很匹配，方便聊聊吗？`;
    const opening = scene === 'email' ? `尊敬的 HR：\n\n` : scene === 'wechat' ? `${name}：` : '';
    const closing = scene === 'email' ? `\n\n祝工作顺利！\n${name}` : '';
    const content = opening + (mode === 'standard' ? body.replace('方便聊聊吗？', '如果有合适的面试机会，希望能进一步沟通。') : body) + closing;

    for (const part of [content.slice(0, 30), content.slice(30, 70), content.slice(70)]) {
      if (part) {
        ctx.emit({ type: 'chunk', text: part });
        await ctx.sleep(300);
      }
    }

    const msg: HRMessage = {
      id: nextId(),
      jd_id: jdId,
      resume_version_id: resumeVersionId,
      scene,
      mode,
      content,
      created_at: isoNow(),
    };
    mutate((d) => d.hr_messages.unshift(msg));
    return { refs: { hr_message_id: msg.id } };
  };
}

/** 简历生成（05 §4.4 装配分工 Mirror）：事实段拷贝、认知段组装 */
export function resumeGenerateScript(resumeId: string, jdId: string | null, instruction: string | null) {
  return async (ctx: TaskCtx) => {
    const d = db();
    const resume = d.resumes.find((r) => r.id === resumeId);
    if (!resume) throw new Error('resume not found');
    const jd = jdId ? d.job_descriptions.find((x) => x.id === jdId) : null;

    // 05 决定 #10：reasoner 思考期间只发占位，不下发思考链
    ctx.emit({ type: 'status', status: 'running', stage: 'thinking' });
    await ctx.sleep(1800);
    ctx.emit({ type: 'status', status: 'running' });
    ctx.emit({ type: 'chunk', text: `正在装配简历：事实段直接拷贝资产库，认知段根据 ${jd ? `「${jd.company} ${jd.title}」` : 'Master 模板'} 定制……\n` });
    await ctx.sleep(700);

    const role = jd?.title || resume.target_role;
    const content = assembleResumeContent(role, d.basic_info?.city ?? '', false);
    if (instruction) {
      ctx.emit({ type: 'chunk', text: `已按你的意见「${instruction}」调整表达。\n` });
      await ctx.sleep(400);
    }
    const md = buildResumeMarkdown(content);
    const previewLines = md.split('\n').slice(0, 8);
    for (const line of previewLines) {
      ctx.emit({ type: 'chunk', text: line + '\n' });
      await ctx.sleep(140);
    }

    const versionNumber = Math.max(0, ...d.resume_versions.filter((v) => v.resume_id === resumeId).map((v) => v.version_number)) + 1;
    const row = {
      id: nextId(),
      resume_id: resumeId,
      version_number: versionNumber,
      content,
      reflection_status: 'pending' as const,
      reflection_result: null,
      confirmed_at: null,
      updated_at: isoNow(),
      created_at: isoNow(),
    };
    mutate((d) => d.resume_versions.push(row));
    return { refs: { resume_version_id: row.id } };
  };
}

/** Reflection（05 §4.5）：程序校验 + 判定，issues 示例命中「性能提升 50%」 */
export function reflectScript(versionId: string) {
  return async (ctx: TaskCtx) => {
    const d = db();
    const ver = d.resume_versions.find((v) => v.id === versionId);
    if (!ver) throw new Error('version not found');
    ctx.emit({ type: 'status', status: 'running', stage: 'thinking' });
    await ctx.sleep(1400);
    ctx.emit({ type: 'status', status: 'running' });
    ctx.emit({ type: 'chunk', text: '正在核对覆盖度与编造风险（可解释性为主、不编造事实）……\n' });
    await ctx.sleep(600);

    const issues: { location: string; claim: string; type: string }[] = [];
    ver.content.projects.forEach((p, i) => {
      p.bullets.forEach((b, j) => {
        if (b.includes('50%') || b.includes('提升 50')) {
          issues.push({ location: `projects[${i}].bullets[${j}]`, claim: b.match(/[^，。]*50%[^，。]*/)?.[0] ?? b, type: 'number_not_in_assets' });
        }
      });
    });
    const hit = [...new Set(ver.content.projects.flatMap((p) => p.tech_stack))].slice(0, 4);
    const missing = ['Docker'];
    const reflectionResult = {
      match_score: 78,
      coverage: { hit_keywords: hit, missing_keywords: issues.length ? missing : [] },
      fabrication: { passed: issues.length === 0, issues },
    };
    mutate((d) => {
      const v = d.resume_versions.find((x) => x.id === versionId);
      if (v) {
        v.reflection_result = reflectionResult;
        v.reflection_status = issues.length ? 'issues' : 'passed';
        v.updated_at = isoNow();
      }
    });
    ctx.emit({ type: 'chunk', text: issues.length ? `发现 ${issues.length} 处可疑表述（已标注定位）` : '覆盖良好，未发现编造迹象' });
    await ctx.sleep(300);
    return { refs: {} };
  };
}