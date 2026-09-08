/** P2b 技能与经历（03 §5 P2）：技能 / 教育 / 经历 / 荣誉 四类资产 CRUD + 排序 */
import { ArrowDown, ArrowUp, Circle, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  createEducation,
  createExperience,
  createHonor,
  deleteEducation,
  deleteExperience,
  deleteHonor,
  deleteSkill,
  educationsKeys,
  experiencesKeys,
  honorsKeys,
  listEducations,
  listExperiences,
  listHonors,
  listSkills,
  createSkill,
  patchSkill,
  reorderEducations,
  reorderExperiences,
  reorderHonors,
  skillsKeys,
} from '../api/assets';
import type { Degree, Education, Experience, ExperienceType, Honor, Proficiency, Skill } from '../api/types';
import { DEGREE_ENTRIES, EXPERIENCE_TYPE_ENTRIES, PROFICIENCY_ENTRIES } from '../lib/enums';
import { PageHeader } from '../components/layout/page-header';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Tabs } from '../components/ui/tabs';
import { Table, TBody, Td, THead, Th, Tr } from '../components/ui/table';
import { useToast } from '../components/ui/toast';

type Key = 'skills' | 'educations' | 'experiences' | 'honors';

export function PortfolioPage() {
  const [tab, setTab] = useState<Key>('skills');
  return (
    <div>
      <PageHeader title="技能与经历" description="简历生成的技能 / 教育 / 经历 / 荣誉事实库" />
      <Tabs
        value={tab}
        onChange={(v) => setTab(v as Key)}
        ariaLabel="资产分类"
        items={[
          { value: 'skills', label: '专业技能' },
          { value: 'educations', label: '教育经历' },
          { value: 'experiences', label: '科研/校园经历' },
          { value: 'honors', label: '荣誉奖项' },
        ]}
      />
      <div className="mt-4">
        {tab === 'skills' && <SkillsTab />}
        {tab === 'educations' && <EducationsTab />}
        {tab === 'experiences' && <ExperiencesTab />}
        {tab === 'honors' && <HonorsTab />}
      </div>
    </div>
  );
}

// ── 公共行操作（上移/下移 = 邻位交换，调 reorder 端点）──────────────
function RowActions({
  index,
  count,
  onMove,
  onDelete,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Button aria-label="上移" variant="ghost" size="sm" className="size-7 p-0" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        <ArrowUp className="size-3.5" aria-hidden="true" />
      </Button>
      <Button aria-label="下移" variant="ghost" size="sm" className="size-7 p-0" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
        <ArrowDown className="size-3.5" aria-hidden="true" />
      </Button>
      <Button aria-label="删除" variant="ghost" size="sm" className="size-7 p-0 text-destructive hover:text-destructive" onClick={onDelete}>
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

// ── 技能 ────────────────────────────────────────────────────────────
function SkillsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: skillsKeys.all, queryFn: listSkills });
  const [name, setName] = useState('');
  const [proficiency, setProficiency] = useState<Proficiency>('familiar');

  const invalidate = () => qc.invalidateQueries({ queryKey: skillsKeys.all });

  const create = useMutation({
    mutationFn: () => createSkill({ name, proficiency }),
    onSuccess: () => {
      setName('');
      void invalidate();
    },
    onError: (e) => {
      const msg =
        e instanceof Error && 'code' in e && (e as { code: string }).code === 'skill_name_exists'
          ? '该技能已存在'
          : e instanceof Error
            ? e.message
            : '添加失败';
      toast(msg, { variant: 'error' });
    },
  });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<Skill> }) => patchSkill(id, body), onSuccess: () => void invalidate() });
  const del = useMutation({ mutationFn: deleteSkill, onSuccess: () => void invalidate() });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-40 flex-1">
          <label htmlFor="skill-name" className="mb-1.5 block text-sm font-medium">
            新增技能
          </label>
          <Input id="skill-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="技能名，如 Python" />
        </div>
        <div className="w-36">
          <Select<Proficiency>
            ariaLabel="熟练度"
            value={proficiency}
            onChange={(v) => setProficiency(v as Proficiency)}
            options={PROFICIENCY_ENTRIES.map((e) => ({ value: e.value, label: e.label }))}
          />
        </div>
        <Button disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>
          <Plus className="size-4" aria-hidden="true" />
          添加
        </Button>
      </div>

      {data && data.length === 0 ? (
        <EmptyState icon={Circle} title="还没有技能" description="技能会进入简历技能段，并按熟练度排序" />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>名称</Th>
              <Th className="w-36">熟练度</Th>
              <Th className="w-20 text-right">操作</Th>
            </Tr>
          </THead>
          <TBody>
            {(data ?? []).map((s, i) => (
              <Tr key={s.id}>
                <Td className="font-medium">{s.name}</Td>
                <Td>
                  <Select<Proficiency>
                    inline
                    ariaLabel={`${s.name} 熟练度`}
                    value={s.proficiency}
                    onChange={(v) => patch.mutate({ id: s.id, body: { proficiency: v as Proficiency } })}
                    options={PROFICIENCY_ENTRIES.map((e) => ({ value: e.value, label: e.label }))}
                  />
                </Td>
                <Td className="text-right">
                  <Button aria-label={`删除 ${s.name}`} variant="ghost" size="sm" className="size-7 p-0 text-destructive hover:text-destructive" onClick={() => del.mutate(s.id)}>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}


// ── 教育经历 ────────────────────────────────────────────────────────
function EducationsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: educationsKeys.all, queryFn: listEducations });
  const [form, setForm] = useState({ school: '', major: '', degree: 'bachelor' as Degree, period: '', courses: '' });

  const invalidate = () => qc.invalidateQueries({ queryKey: educationsKeys.all });

  const create = useMutation({
    mutationFn: () => createEducation(form),
    onSuccess: () => {
      setForm({ school: '', major: '', degree: 'bachelor', period: '', courses: '' });
      void invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : '添加失败', { variant: 'error' }),
  });
  const del = useMutation({ mutationFn: deleteEducation, onSuccess: () => void invalidate() });
  const reorder = useMutation({ mutationFn: reorderEducations, onSuccess: () => void invalidate() });

  const move = (from: number, to: number) => {
    const ids = (data ?? []).map((x) => x.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-4">
      <AddForm onAdd={() => create.mutate()} loading={create.isPending} disabled={!form.school.trim()}>
        <AddField label="学校" required>
          <Input value={form.school} onChange={(e) => setForm((f) => ({ ...f, school: e.target.value }))} />
        </AddField>
        <AddField label="专业">
          <Input value={form.major} onChange={(e) => setForm((f) => ({ ...f, major: e.target.value }))} />
        </AddField>
        <AddField label="学历">
          <Select<Degree>
            ariaLabel="学历"
            value={form.degree}
            onChange={(v) => setForm((f) => ({ ...f, degree: v as Degree }))}
            options={DEGREE_ENTRIES.map((e) => ({ value: e.value, label: e.label }))}
          />
        </AddField>
        <AddField label="时间">
          <Input value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} placeholder="2020.09 – 2024.06" />
        </AddField>
        <AddField label="核心课程" wide>
          <Input value={form.courses} onChange={(e) => setForm((f) => ({ ...f, courses: e.target.value }))} />
        </AddField>
      </AddForm>

      {data && data.length === 0 ? (
        <EmptyState icon={Circle} title="还没有教育经历" />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>学校</Th>
              <Th>专业</Th>
              <Th className="w-24">学历</Th>
              <Th className="w-40">时间</Th>
              <Th className="w-20 text-right">操作</Th>
            </Tr>
          </THead>
          <TBody>
            {(data ?? []).map((e, i) => (
              <Tr key={e.id}>
                <Td className="font-medium">{e.school}</Td>
                <Td>{e.major}</Td>
                <Td>{DEGREE_ENTRIES.find((x) => x.value === e.degree)?.label}</Td>
                <Td>{e.period}</Td>
                <Td className="text-right">
                  <RowActions index={i} count={(data ?? []).length} onMove={move} onDelete={() => del.mutate(e.id)} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

// ── 科研/校园经历 ───────────────────────────────────────────────────
function ExperiencesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: experiencesKeys.all, queryFn: listExperiences });
  const [form, setForm] = useState({ type: 'research' as ExperienceType, name: '', role: '', period: '', description: '' });

  const invalidate = () => qc.invalidateQueries({ queryKey: experiencesKeys.all });

  const create = useMutation({
    mutationFn: () => createExperience(form),
    onSuccess: () => {
      setForm({ type: form.type, name: '', role: '', period: '', description: '' });
      void invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : '添加失败', { variant: 'error' }),
  });
  const del = useMutation({ mutationFn: deleteExperience, onSuccess: () => void invalidate() });
  const reorder = useMutation({ mutationFn: reorderExperiences, onSuccess: () => void invalidate() });

  const move = (from: number, to: number) => {
    const ids = (data ?? []).map((x) => x.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-4">
      <AddForm onAdd={() => create.mutate()} loading={create.isPending} disabled={!form.name.trim()}>
        <AddField label="类型">
          <Select<ExperienceType>
            ariaLabel="经历类型"
            value={form.type}
            onChange={(v) => setForm((f) => ({ ...f, type: v as ExperienceType }))}
            options={EXPERIENCE_TYPE_ENTRIES.map((e) => ({ value: e.value, label: e.label }))}
          />
        </AddField>
        <AddField label="名称" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </AddField>
        <AddField label="角色">
          <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
        </AddField>
        <AddField label="时间">
          <Input value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} />
        </AddField>
        <AddField label="描述" wide>
          <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </AddField>
      </AddForm>

      {data && data.length === 0 ? (
        <EmptyState icon={Circle} title="还没有科研/校园经历" />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th className="w-24">类型</Th>
              <Th>名称</Th>
              <Th>角色</Th>
              <Th className="w-40">时间</Th>
              <Th className="w-20 text-right">操作</Th>
            </Tr>
          </THead>
          <TBody>
            {(data ?? []).map((e, i) => (
              <Tr key={e.id}>
                <Td>
                  <Badge tone={e.type === 'research' ? 'primary' : 'neutral'}>
                    {EXPERIENCE_TYPE_ENTRIES.find((x) => x.value === e.type)?.label}
                  </Badge>
                </Td>
                <Td className="font-medium">{e.name}</Td>
                <Td>{e.role}</Td>
                <Td>{e.period}</Td>
                <Td className="text-right">
                  <RowActions index={i} count={(data ?? []).length} onMove={move} onDelete={() => del.mutate(e.id)} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

// ── 荣誉 ────────────────────────────────────────────────────────────
function HonorsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: honorsKeys.all, queryFn: listHonors });
  const [form, setForm] = useState({ name: '', time: '' });

  const invalidate = () => qc.invalidateQueries({ queryKey: honorsKeys.all });

  const create = useMutation({
    mutationFn: () => createHonor(form),
    onSuccess: () => {
      setForm({ name: '', time: '' });
      void invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : '添加失败', { variant: 'error' }),
  });
  const del = useMutation({ mutationFn: deleteHonor, onSuccess: () => void invalidate() });
  const reorder = useMutation({ mutationFn: reorderHonors, onSuccess: () => void invalidate() });

  const move = (from: number, to: number) => {
    const ids = (data ?? []).map((x) => x.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-4">
      <AddForm onAdd={() => create.mutate()} loading={create.isPending} disabled={!form.name.trim()}>
        <AddField label="奖项名称" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </AddField>
        <AddField label="时间">
          <Input value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
        </AddField>
      </AddForm>

      {data && data.length === 0 ? (
        <EmptyState icon={Circle} title="还没有荣誉奖项" />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>名称</Th>
              <Th className="w-40">时间</Th>
              <Th className="w-20 text-right">操作</Th>
            </Tr>
          </THead>
          <TBody>
            {(data ?? []).map((h, i) => (
              <Tr key={h.id}>
                <Td className="font-medium">{h.name}</Td>
                <Td>{h.time}</Td>
                <Td className="text-right">
                  <RowActions index={i} count={(data ?? []).length} onMove={move} onDelete={() => del.mutate(h.id)} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

// ── 新建区布局 ──────────────────────────────────────────────────────
function AddForm({
  children,
  onAdd,
  loading,
  disabled,
}: {
  children: ReactNode;
  onAdd: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-3">
        {children}
        <Button disabled={disabled} loading={loading} onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          添加
        </Button>
      </div>
    </div>
  );
}

function AddField({
  label,
  wide,
  required,
  children,
}: {
  label: string;
  wide?: boolean;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'w-full' : 'min-w-36 flex-1'}>
      <label className="mb-1.5 block text-sm font-medium">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}