/**
 * SectionAccordion（03 §8 / §5 P6.3）：ResumeContent 8 段编辑器。
 * 与 02 §6.1 结构逐键对应；空段留白由 resume-render 自动隐藏（提示随组件给出）。
 */
import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Availability, Degree, Proficiency, ResumeContent } from '../../api/types';
import { AVAILABILITY_ENTRIES, DEGREE_ENTRIES, PROFICIENCY_ENTRIES } from '../../lib/enums';
import { AccordionItem } from '../ui/accordion';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { Input, Textarea } from '../ui/input';
import { Select } from '../ui/select';
import { TagInput } from './tag-input';

const entryOptions = <T extends string>(entries: { value: T; label: string }[]): { value: T; label: string }[] =>
  entries.map((e) => ({ value: e.value, label: e.label }));

function ItemCard({
  title,
  onRemove,
  disabled,
  children,
}: {
  title: string;
  onRemove?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{title}</span>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onRemove}
            className="h-7 gap-1 px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            删除
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

const EMPTY_HINT = '留空则不输出该段（预览与导出时自动隐藏）';

const updateAt = <T,>(arr: T[], i: number, patch: Partial<T>): T[] =>
  arr.map((item, j) => (j === i ? { ...item, ...patch } : item));

export type SectionKey =
  | 'basic'
  | 'intention'
  | 'education'
  | 'projects'
  | 'research'
  | 'campus'
  | 'honors'
  | 'skills'
  | 'self_eval';

interface SectionAccordionProps {
  content: ResumeContent;
  onChange: (content: ResumeContent) => void;
  disabled?: boolean;
  defaultOpenKey?: SectionKey;
  /** 锁定（版本已确认 / 只读查看）时隐藏操作按钮，仅展示 */
  readOnly?: boolean;
}

export function SectionAccordion({ content, onChange, disabled, defaultOpenKey, readOnly }: SectionAccordionProps) {
  const patch = (p: Partial<ResumeContent>) => onChange({ ...content, ...p });
  const editable = !readOnly && !disabled;
  const openOf = (key: SectionKey) => ({ defaultOpen: defaultOpenKey === key });

  return (
    <div className="space-y-2">
      {/* 1. 基本信息 */}
      <AccordionItem title="基本信息" {...openOf('basic')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="姓名" required>
            <Input id="azi-basic-name" value={content.basic_info.name} disabled={!editable} onChange={(e) => patch({ basic_info: { ...content.basic_info, name: e.target.value } })} />
          </Field>
          <Field label="邮箱" required>
            <Input id="azi-basic-email" type="email" value={content.basic_info.email} disabled={!editable} onChange={(e) => patch({ basic_info: { ...content.basic_info, email: e.target.value } })} />
          </Field>
          <Field label="电话" required>
            <Input id="azi-basic-phone" value={content.basic_info.phone} disabled={!editable} onChange={(e) => patch({ basic_info: { ...content.basic_info, phone: e.target.value } })} />
          </Field>
          <Field label="GitHub">
            <Input id="azi-basic-github" value={content.basic_info.github ?? ''} disabled={!editable} onChange={(e) => patch({ basic_info: { ...content.basic_info, github: e.target.value || null } })} />
          </Field>
          <Field label="个人主页">
            <Input id="azi-basic-homepage" value={content.basic_info.homepage ?? ''} disabled={!editable} onChange={(e) => patch({ basic_info: { ...content.basic_info, homepage: e.target.value || null } })} />
          </Field>
        </div>
      </AccordionItem>

      {/* 2. 求职意向 */}
      <AccordionItem title="求职意向" {...openOf('intention')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="意向岗位" required>
            <Input id="azi-intention-role" value={content.job_intention.role} disabled={!editable} onChange={(e) => patch({ job_intention: { ...content.job_intention, role: e.target.value } })} />
          </Field>
          <Field label="城市">
            <Input id="azi-intention-city" value={content.job_intention.city} disabled={!editable} onChange={(e) => patch({ job_intention: { ...content.job_intention, city: e.target.value } })} />
          </Field>
          <Field label="到岗时间">
            <Select<Availability>
              value={content.job_intention.availability}
              onChange={(v) => patch({ job_intention: { ...content.job_intention, availability: v as Availability } })}
              options={entryOptions(AVAILABILITY_ENTRIES)}
              disabled={!editable}
              ariaLabel="到岗时间"
            />
          </Field>
        </div>
      </AccordionItem>

      {/* 3. 教育经历 */}
      <AccordionItem title="教育经历" extra={<CountChip n={content.education.length} />} {...openOf('education')}>
        <div className="space-y-3">
          {content.education.length === 0 && <p className="text-xs text-muted-foreground">{EMPTY_HINT}</p>}
          {content.education.map((edu, i) => (
            <ItemCard key={i} title={`#${i + 1}`} disabled={!editable} onRemove={() => patch({ education: content.education.filter((_, j) => j !== i) })}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="学校" required>
                  <Input value={edu.school} disabled={!editable} onChange={(e) => patch({ education: updateAt(content.education, i, { school: e.target.value }) })} />
                </Field>
                <Field label="专业">
                  <Input value={edu.major} disabled={!editable} onChange={(e) => patch({ education: updateAt(content.education, i, { major: e.target.value }) })} />
                </Field>
                <Field label="学历">
                  <Select<Degree>
                    value={edu.degree}
                    onChange={(v) => patch({ education: updateAt(content.education, i, { degree: v as Degree }) })}
                    options={entryOptions(DEGREE_ENTRIES)}
                    disabled={!editable}
                    ariaLabel="学历"
                  />
                </Field>
                <Field label="时间" helper="如 2020.09 – 2024.06">
                  <Input value={edu.period} disabled={!editable} onChange={(e) => patch({ education: updateAt(content.education, i, { period: e.target.value }) })} />
                </Field>
                <Field label="核心课程" className="sm:col-span-2">
                  <Input value={edu.courses} disabled={!editable} onChange={(e) => patch({ education: updateAt(content.education, i, { courses: e.target.value }) })} />
                </Field>
              </div>
            </ItemCard>
          ))}
          {editable && (
            <Button variant="outline" size="sm" onClick={() => patch({ education: [...content.education, { school: '', major: '', degree: 'bachelor', period: '', courses: '' }] })}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              添加教育经历
            </Button>
          )}
        </div>
      </AccordionItem>

      {/* 4. 项目经历 */}
      <AccordionItem title="项目经历" extra={<CountChip n={content.projects.length} />} {...openOf('projects')}>
        <div className="space-y-3">
          {content.projects.length === 0 && <p className="text-xs text-muted-foreground">{EMPTY_HINT}</p>}
          {content.projects.map((proj, i) => (
            <ItemCard key={i} title={proj.name || `#${i + 1}`} disabled={!editable} onRemove={() => patch({ projects: content.projects.filter((_, j) => j !== i) })}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="项目名称" required>
                  <Input value={proj.name} disabled={!editable} onChange={(e) => patch({ projects: updateAt(content.projects, i, { name: e.target.value }) })} />
                </Field>
                <Field label="时间">
                  <Input value={proj.period} disabled={!editable} onChange={(e) => patch({ projects: updateAt(content.projects, i, { period: e.target.value }) })} />
                </Field>
                <Field label="角色">
                  <Input value={proj.role} disabled={!editable} onChange={(e) => patch({ projects: updateAt(content.projects, i, { role: e.target.value }) })} />
                </Field>
                <Field label="技术栈">
                  <TagInput
                    ariaLabel={`项目 ${i + 1} 技术栈`}
                    value={proj.tech_stack}
                    disabled={!editable}
                    onChange={(v) => patch({ projects: updateAt(content.projects, i, { tech_stack: v }) })}
                    placeholder="回车添加，如 Python"
                  />
                </Field>
                <Field label="要点（每行一条）" className="sm:col-span-2">
                  <Textarea
                    rows={4}
                    value={proj.bullets.join('\n')}
                    disabled={!editable}
                    onChange={(e) => patch({ projects: updateAt(content.projects, i, { bullets: e.target.value.split('\n') }) })}
                  />
                </Field>
                <Field label="GitHub">
                  <Input value={proj.github ?? ''} disabled={!editable} onChange={(e) => patch({ projects: updateAt(content.projects, i, { github: e.target.value || null }) })} />
                </Field>
                <Field label="Demo">
                  <Input value={proj.demo ?? ''} disabled={!editable} onChange={(e) => patch({ projects: updateAt(content.projects, i, { demo: e.target.value || null }) })} />
                </Field>
              </div>
            </ItemCard>
          ))}
          {editable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => patch({ projects: [...content.projects, { name: '', period: '', role: '', tech_stack: [], bullets: [], github: null, demo: null }] })}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              添加项目
            </Button>
          )}
        </div>
      </AccordionItem>

      {/* 5/6. 科研 / 校园经历 */}
      <AssetSection title="科研经历" rows={content.research} {...openOf('research')}
        onRows={(rows) => patch({ research: rows })} editable={editable} addLabel="添加科研经历" />
      <AssetSection title="校园经历" rows={content.campus} {...openOf('campus')}
        onRows={(rows) => patch({ campus: rows })} editable={editable} addLabel="添加校园经历" />

      {/* 7. 荣誉 */}
      <AccordionItem title="荣誉奖项" extra={<CountChip n={content.honors.length} />} {...openOf('honors')}>
        <div className="space-y-3">
          {content.honors.length === 0 && <p className="text-xs text-muted-foreground">{EMPTY_HINT}</p>}
          {content.honors.map((honor, i) => (
            <ItemCard key={i} title={`#${i + 1}`} disabled={!editable} onRemove={() => patch({ honors: content.honors.filter((_, j) => j !== i) })}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="奖项名称" required>
                  <Input value={honor.name} disabled={!editable} onChange={(e) => patch({ honors: updateAt(content.honors, i, { name: e.target.value }) })} />
                </Field>
                <Field label="时间">
                  <Input value={honor.time} disabled={!editable} onChange={(e) => patch({ honors: updateAt(content.honors, i, { time: e.target.value }) })} />
                </Field>
              </div>
            </ItemCard>
          ))}
          {editable && (
            <Button variant="outline" size="sm" onClick={() => patch({ honors: [...content.honors, { name: '', time: '' }] })}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              添加荣誉
            </Button>
          )}
        </div>
      </AccordionItem>

      {/* 8. 技能 */}
      <AccordionItem title="专业技能" extra={<CountChip n={content.skills.length} />} {...openOf('skills')}>
        <div className="space-y-3">
          {content.skills.length === 0 && <p className="text-xs text-muted-foreground">{EMPTY_HINT}</p>}
          {content.skills.map((skill, i) => (
            <ItemCard key={i} title={`#${i + 1}`} disabled={!editable} onRemove={() => patch({ skills: content.skills.filter((_, j) => j !== i) })}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="技能名称" required>
                  <Input value={skill.name} disabled={!editable} onChange={(e) => patch({ skills: updateAt(content.skills, i, { name: e.target.value }) })} />
                </Field>
                <Field label="熟练度">
                  <Select<Proficiency>
                    value={skill.proficiency}
                    onChange={(v) => patch({ skills: updateAt(content.skills, i, { proficiency: v as Proficiency }) })}
                    options={entryOptions(PROFICIENCY_ENTRIES)}
                    disabled={!editable}
                    ariaLabel="熟练度"
                  />
                </Field>
              </div>
            </ItemCard>
          ))}
          {editable && (
            <Button variant="outline" size="sm" onClick={() => patch({ skills: [...content.skills, { name: '', proficiency: 'familiar' }] })}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              添加技能
            </Button>
          )}
        </div>
      </AccordionItem>

      {/* 9. 自我评价 */}
      <AccordionItem title="自我评价" {...openOf('self_eval')}>
        <Field label="自我评价" helper="AI 润色入口在页面顶栏「AI 润色」" className="mt-1">
          <Textarea
            aria-label="自我评价"
            rows={4}
            value={content.self_evaluation}
            disabled={!editable}
            onChange={(e) => patch({ self_evaluation: e.target.value })}
          />
        </Field>
      </AccordionItem>
    </div>
  );
}

/** 列表段组头计数 chip */
function CountChip({ n }: { n: number }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground" aria-label={`${n} 项`}>
      {n}
    </span>
  );
}

/** 科研/校园共用：AssetRow 列表段 */
function AssetSection({
  title,
  rows,
  onRows,
  editable,
  addLabel,
  defaultOpen,
}: {
  title: string;
  rows: ResumeContent['research'];
  onRows: (rows: ResumeContent['research']) => void;
  editable: boolean;
  addLabel: string;
  defaultOpen?: boolean;
}) {
  return (
    <AccordionItem title={title} defaultOpen={defaultOpen} extra={<CountChip n={rows.length} />}>
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">{EMPTY_HINT}</p>}
        {rows.map((row, i) => (
          <ItemCard key={i} title={row.name || `#${i + 1}`} disabled={!editable} onRemove={() => onRows(rows.filter((_, j) => j !== i))}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="名称/主题" required>
                <Input value={row.name} disabled={!editable} onChange={(e) => onRows(updateAt(rows, i, { name: e.target.value }))} />
              </Field>
              <Field label="角色">
                <Input value={row.role} disabled={!editable} onChange={(e) => onRows(updateAt(rows, i, { role: e.target.value }))} />
              </Field>
              <Field label="时间">
                <Input value={row.period} disabled={!editable} onChange={(e) => onRows(updateAt(rows, i, { period: e.target.value }))} />
              </Field>
              <Field label="描述" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={row.description}
                  disabled={!editable}
                  onChange={(e) => onRows(updateAt(rows, i, { description: e.target.value }))}
                />
              </Field>
            </div>
          </ItemCard>
        ))}
        {editable && (
          <Button variant="outline" size="sm" onClick={() => onRows([...rows, { name: '', role: '', period: '', description: '' }])}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {addLabel}
          </Button>
        )}
      </div>
    </AccordionItem>
  );
}