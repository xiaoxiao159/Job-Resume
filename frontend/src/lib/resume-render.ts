/**
 * 简历 Markdown/HTML 构建 —— 模拟后端 Jinja2 渲染（04 §5.4：渲染由后端统一执行）。
 * 本文件是后端渲染器的前端镜像：Mock preview/export 与 Studio「本地即时预览」
 * 共用同一规则，保证两端产物一致（06 §6 P6 注释约定）。
 * 定位锚点（06 §10.1 契约）：MD 中每项目 bullet 行后输出 `<!--azi-loc:projects[i].bullets[j]-->`，
 * 供 ReflectionPanel 点击定位（MDPreview 的 rehype 插件提取）。
 */
import type { Proficiency, ResumeContent, ResumeTemplate } from '../api/types';

const PROFICIENCY_LABEL: Record<Proficiency, string> = {
  beginner: '了解',
  familiar: '熟悉',
  proficient: '熟练',
  expert: '精通',
};

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildResumeMarkdown(c: ResumeContent): string {
  const L: string[] = [];
  const push = (line: string) => L.push(line);

  push(`# ${c.basic_info.name}`);
  push('');
  const contact = [c.basic_info.phone, c.basic_info.email, c.basic_info.github]
    .filter(Boolean)
    .join(' · ');
  push(contact);
  push('');
  push(`**求职意向**：${c.job_intention.role} · ${c.job_intention.city} · ${availabilityLabel(c.job_intention.availability)}`);
  push('');

  if (c.education.length) {
    push('## 教育背景');
    push('');
    for (const e of c.education) {
      push(`- **${esc(e.school)}** · ${esc(e.major)} · ${degreeLabel(e.degree)}（${esc(e.period)}）`);
      if (e.courses) push(`  - 主修课程：${esc(e.courses)}`);
    }
    push('');
  }

  if (c.projects.length) {
    push('## 项目经历');
    push('');
    c.projects.forEach((p, i) => {
      push(`### ${esc(p.name)}${p.role ? ` · ${esc(p.role)}` : ''}（${esc(p.period)}）`);
      push('');
      if (p.tech_stack.length) push(`*技术栈：${p.tech_stack.map(esc).join(' / ')}*`);
      push('');
      p.bullets.forEach((b, j) => {
        push(`- ${esc(b)}`);
        push(`<!--azi-loc:projects[${i}].bullets[${j}]-->`);
      });
      push('');
      if (p.github || p.demo) {
        push(`链接：${[p.github && `GitHub（${esc(p.github)}）`, p.demo && `Demo（${esc(p.demo)}）`].filter(Boolean).join(' · ')}`);
        push('');
      }
    });
  }

  if (c.research.length) {
    push('## 科研经历');
    push('');
    for (const e of c.research) {
      push(`- **${esc(e.name)}** · ${esc(e.role)}（${esc(e.period)}）`);
      if (e.description) push(`  - ${esc(e.description)}`);
    }
    push('');
  }
  if (c.campus.length) {
    push('## 校园经历');
    push('');
    for (const e of c.campus) {
      push(`- **${esc(e.name)}** · ${esc(e.role)}（${esc(e.period)}）`);
      if (e.description) push(`  - ${esc(e.description)}`);
    }
    push('');
  }

  if (c.honors.length) {
    push('## 荣誉奖项');
    push('');
    for (const h of c.honors) push(`- ${esc(h.name)}（${esc(h.time)}）`);
    push('');
  }

  if (c.skills.length) {
    push('## 专业技能');
    push('');
    push(
      c.skills.map((s) => `${esc(s.name)}（${PROFICIENCY_LABEL[s.proficiency] ?? s.proficiency}）`).join('、'),
    );
    push('');
  }

  if (c.self_evaluation) {
    push('## 自我评价');
    push('');
    push(esc(c.self_evaluation));
    push('');
  }

  return L.join('\n');
}

function availabilityLabel(v: string): string {
  const map: Record<string, string> = {
    immediate: '立即到岗',
    within_1_week: '一周内到岗',
    within_2_weeks: '两周内到岗',
    within_1_month: '一个月内到岗',
    undecided: '到岗时间待定',
  };
  return map[v] ?? v;
}

function degreeLabel(v: string): string {
  const map: Record<string, string> = { bachelor: '本科', master: '硕士', phd: '博士' };
  return map[v] ?? v;
}

/** 三套模板的内联样式 HTML（镜像后端模板，仅开发/Mock 用；生产以后端渲染为准） */
export function buildResumeHtml(c: ResumeContent, template: ResumeTemplate | null): string {
  const t = template ?? 'classic';
  const sections: string[] = [];
  const name = esc(c.basic_info.name);

  const contact = [c.basic_info.phone, c.basic_info.email, c.basic_info.github].filter(Boolean).join(' | ');
  sections.push(
    `<header class="hdr"><h1>${name}</h1><p>${esc(c.job_intention.role)} · ${esc(c.job_intention.city)} · ${availabilityLabel(c.job_intention.availability)}</p><p class="contact">${esc(contact)}</p></header>`,
  );

  if (c.education.length)
    sections.push(`<section><h2>教育背景</h2>${c.education
      .map((e) => `<p><b>${esc(e.school)}</b> · ${esc(e.major)} · ${degreeLabel(e.degree)} · ${esc(e.period)}${e.courses ? `<br>主修课程：${esc(e.courses)}` : ''}</p>`)
      .join('')}</section>`);

  if (c.projects.length)
    sections.push(`<section><h2>项目经历</h2>${c.projects
      .map(
        (p) =>
          `<article><h3>${esc(p.name)} · ${esc(p.period)}</h3>${p.tech_stack.length ? `<p class="stack">${p.tech_stack.map(esc).join(' · ')}</p>` : ''}<ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></article>`,
      )
      .join('')}</section>`);

  const mkExp = (title: string, rows: Array<{ name: string; role: string; period: string; description: string }>) =>
    rows.length ? `<section><h2>${title}</h2>${rows.map((e) => `<p><b>${esc(e.name)}</b> · ${esc(e.role)} · ${esc(e.period)}${e.description ? `<br>${esc(e.description)}` : ''}</p>`).join('')}</section>` : '';
  sections.push(mkExp('科研经历', c.research));
  sections.push(mkExp('校园经历', c.campus));

  if (c.honors.length)
    sections.push(`<section><h2>荣誉奖项</h2><ul>${c.honors.map((h) => `<li>${esc(h.name)}（${esc(h.time)}）</li>`).join('')}</ul></section>`);

  if (c.skills.length)
    sections.push(
      `<section><h2>专业技能</h2><p>${c.skills.map((s) => `${esc(s.name)}（${PROFICIENCY_LABEL[s.proficiency] ?? s.proficiency}）`).join('、')}</p></section>`,
    );

  if (c.self_evaluation)
    sections.push(`<section><h2>自我评价</h2><p>${esc(c.self_evaluation).replace(/\n/g, '<br>')}</p></section>`);

  const style =
    t === 'modern'
      ? `body{font-family:'Open Sans','PingFang SC',sans-serif;color:#1a2333;background:#fff;margin:0;padding:32px 40px}h1{font-size:28px;margin:0 0 4px;color:#0369a1}.hdr{border-bottom:3px solid #0369a1;padding-bottom:14px;margin-bottom:20px}.hdr p{margin:2px 0;color:#334155}.contact{font-size:13px;color:#64748b}h2{font-size:17px;color:#0369a1;border-left:4px solid #0369a1;padding-left:8px;margin:20px 0 8px}h3{font-size:14px;margin:8px 0 2px}p,li{font-size:13px;line-height:1.7;margin:2px 0}ul{margin:4px 0;padding-left:18px}.stack{font-size:12px;color:#64748b}section{margin-bottom:6px}`
      : t === 'minimal'
        ? `body{font-family:'Open Sans','PingFang SC',sans-serif;color:#111;background:#fff;margin:0;padding:36px 44px;line-height:1.65}h1{font-size:24px;margin:0}h2{font-size:14px;letter-spacing:.12em;text-transform:none;margin:22px 0 8px;color:#111;border-bottom:1px solid #ddd;padding-bottom:4px}h3{font-size:13px;margin:10px 0 2px}p,li{font-size:13px;margin:3px 0}.hdr p{color:#555;font-size:13px}.contact{font-size:12px;color:#888}ul{padding-left:18px}`
        : `body{font-family:'Open Sans','PingFang SC',sans-serif;color:#1e293b;background:#fff;margin:0;padding:34px 42px;line-height:1.7}.hdr{text-align:center;margin-bottom:18px}.hdr h1{font-size:26px;margin:0 0 4px}.hdr p{margin:2px 0;font-size:13px;color:#475569}.contact{font-size:12px;color:#64748b}h2{font-size:15px;color:#1e293b;border-bottom:2px solid #1e293b;margin:20px 0 8px;padding-bottom:3px}h3{font-size:14px;margin:8px 0 2px}p,li{font-size:13px;margin:2px 0}ul{padding-left:18px}.stack{font-size:12px;color:#64748b}`;

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${name} - 简历</title><style>${style}</style></head><body>${sections.join('\n')}</body></html>`;
}