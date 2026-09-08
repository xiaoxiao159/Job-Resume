/**
 * P4b 项目详情（03 §5 P4.4 / 05 §4.6–4.7）：
 * 项目事实（含证据/技能关联）+ 三类表达（生成→确认→编辑→重生成）+ AI 协助（问卷/多轮对话/停止回填）。
 */
import { FileText, Link2, MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  assistChat,
  assistQuestionnaire,
  assistRefill,
  createEvidence,
  deleteEvidence,
  deleteProject,
  generateExpression,
  getProject,
  getProjectSkills,
  listEvidence,
  listExpressions,
  patchExpression,
  patchProject,
  projectKeys,
  setProjectSkills,
} from '../api/projects';
import { listSkills, skillsKeys } from '../api/assets';
import { useAgentTask } from '../hooks/useAgentTask';
import type {
  ChatMessage,
  Evidence,
  ExpressionType,
  Project,
  ProjectExpression,
  ProjectExpressionContent,
  RefillFields,
} from '../api/types';
import { EVIDENCE_TYPE_ENTRIES, EXPRESSION_STATUS_ENTRIES, EXPRESSION_TYPE_ENTRIES } from '../lib/enums';
import { PageHeader } from '../components/layout/page-header';
import { AIConfirmCard } from '../components/business/ai-confirm-card';
import { AssistChatDrawer } from '../components/business/assist-chat-drawer';
import { AssistQuestionnaire } from '../components/business/assist-questionnaire';
import { RefillDiff } from '../components/business/refill-diff';
import { StreamText } from '../components/business/stream-text';
import { TagInput } from '../components/business/tag-input';
import { AiDraftBadge, StatusPill } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Input, Textarea } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { Select } from '../components/ui/select';
import { SkeletonList } from '../components/ui/skeleton';
import { Tabs } from '../components/ui/tabs';
import { useToast } from '../components/ui/toast';

const ASSIST_WELCOME: ChatMessage = {
  role: 'assistant',
  content: '你好，我是项目助手。围绕这个项目聊聊吧——我会追问背景、目标、你的核心工作、难点与量化结果，直到素材足以支撑面试和简历。',
};

const QUESTIONNAIRE_QUESTIONS = [
  '这个项目要解决什么问题？背景是什么？',
  '你的角色和具体职责是什么？',
  '你做了哪些核心工作？遇到了什么难点、怎么解决的？',
  '最终结果如何？有没有量化数据（性能/用户/准确率）？',
];

// ── 表达内容 ⇄ 展示文本（编辑走结构化弹窗，不经文本反解析）─────────
export function contentToText(type: ExpressionType, content: ProjectExpressionContent): string {
  if ('bullets' in content) return content.bullets.map((b) => `• ${b}`).join('\n');
  if ('background' in content) {
    const lines: [string, string][] = [
      ['背景', content.background],
      ['职责', content.responsibility],
      ['架构', content.architecture],
      ['难点', content.difficulty],
      ['解决方案', content.solution],
      ['结果', content.result],
    ];
    return lines.map(([k, v]) => `${k}：${v}`).join('\n');
  }
  const lines: [string, string][] = [
    ['情境', content.situation],
    ['任务', content.task],
    ['行动', content.action],
    ['结果', content.result],
  ];
  return lines.map(([k, v]) => `${k}：${v}`).join('\n');
}

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: project, isLoading } = useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProject(projectId),
  });

  const [tab, setTab] = useState('overview');

  // 协助三任务流：对话 / 问卷 / 回填（各自独立，避免相位互踩）
  const chatTask = useAgentTask();
  const qTask = useAgentTask();
  const refillTask = useAgentTask();

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([ASSIST_WELCOME]);
  const messagesRef = useMemo(() => messages, [messages]);

  const [qOpen, setQOpen] = useState(false);
  const [refillOpen, setRefillOpen] = useState(false);
  const [refillDraft, setRefillDraft] = useState<RefillFields | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const chatStreaming = chatTask.state.phase === 'triggering' || chatTask.state.phase === 'streaming';

  // 删除项目
  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: () => {
      toast('项目已删除', { variant: 'success' });
      void qc.invalidateQueries({ queryKey: projectKeys.all });
      navigate('/projects');
    },
  });

  // ── 对话：历史全量上送（04 决定 #4），reply 回填本地消息流 ──────────
  const sendChat = (text: string) => {
    const next: ChatMessage[] = [...messagesRef, { role: 'user', content: text }];
    setMessages(next);
    void chatTask.run(
      () => assistChat(projectId, next),
      {
        onDone: (s) => {
          setMessages((m) => [...m, { role: 'assistant', content: s.text }]);
          chatTask.reset();
        },
      },
    );
  };

  // ── 停止并回填：refill 任务 → 七字段对比弹窗 ────────────────────────
  const stopAndRefill = () => {
    void refillTask.run(
      () => assistRefill(projectId, messagesRef),
      {
        onDone: (s) => {
          const fields = (s.result as { fields?: RefillFields } | null)?.fields;
          if (fields) {
            setRefillDraft(fields);
            setRefillOpen(true);
          }
          refillTask.reset();
        },
      },
    );
  };

  const applyRefill = (merged: RefillFields): Promise<void> =>
    patchProject(projectId, merged).then(() => {
      toast('已应用到项目素材', { variant: 'success' });
      setRefillOpen(false);
      void qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    });

  // ── 问卷：提交 → 解析 → follow_up 进入对话 ──────────────────────────
  const submitQuestionnaire = (answers: string[]): Promise<void> =>
    new Promise((resolve, reject) => {
      void qTask
        .run(
          () => assistQuestionnaire(projectId, QUESTIONNAIRE_QUESTIONS.map((question, i) => ({ question, answer: answers[i] ?? '' }))),
          {
            onDone: (s) => {
              const followUp = (s.result as { follow_up?: string } | null)?.follow_up;
              setQOpen(false);
              if (typeof followUp === 'string' && followUp.trim()) {
                setMessages((m) => [...m, { role: 'assistant', content: followUp }]);
              }
              setChatOpen(true);
              qTask.reset();
              resolve();
            },
          },
        )
        .then((ok) => {
          if (!ok) reject(new Error('任务未启动'));
        });
    });

  if (isLoading || !project) return <SkeletonList rows={8} />;

  const currentRefill: RefillFields = {
    background: project.background,
    goal: project.goal,
    responsibilities: project.responsibilities,
    core_work: project.core_work,
    difficulties: project.difficulties,
    solutions: project.solutions,
    results: project.results,
  };

  return (
    <div>
      <PageHeader
        title={project.name}
        description={`${project.role || '—'} · ${project.start_date || '—'} – ${project.end_date || '至今'}`}
      >
        <Button variant="outline" onClick={() => setChatOpen(true)}>
          <MessageSquareText className="size-4" aria-hidden="true" />
          AI 对话补全
        </Button>
        <Button variant="outline" onClick={() => setQOpen(true)}>
          问卷补充
        </Button>
        <EditProjectModal project={project} />
      </PageHeader>

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="项目视图"
        items={[
          { value: 'overview', label: '项目资料' },
          ...EXPRESSION_TYPE_ENTRIES.map((e) => ({ value: e.value, label: e.label })),
        ]}
      />

      <div className="mt-4">
        {tab === 'overview' && <OverviewTab project={project} onDelete={() => setDeleteOpen(true)} />}
        {EXPRESSION_TYPE_ENTRIES.some((e) => e.value === tab) && (
          <ExpressionTab key={tab} projectId={projectId} type={tab as ExpressionType} />
        )}
      </div>

      {/* 问卷 */}
      <AssistQuestionnaire
        open={qOpen}
        onOpenChange={setQOpen}
        questions={QUESTIONNAIRE_QUESTIONS}
        busy={qTask.state.phase === 'triggering' || qTask.state.phase === 'streaming'}
        onSubmit={submitQuestionnaire}
      />

      {/* 对话抽屉 */}
      <AssistChatDrawer
        open={chatOpen}
        onOpenChange={setChatOpen}
        title={`项目助手 · ${project.name}`}
        messages={messages}
        streaming={chatStreaming}
        thinking={chatTask.state.thinking}
        onSend={sendChat}
        onCancel={() => void chatTask.cancel()}
        canRefill={!chatStreaming && messages.some((m) => m.role === 'user')}
        canCancel
        onStopAndRefill={stopAndRefill}
        refilling={refillTask.state.phase === 'triggering' || refillTask.state.phase === 'streaming'}
      />

      {/* 回填对比 */}
      <Modal
        open={refillOpen}
        onOpenChange={setRefillOpen}
        title="AI 回填建议"
        description="逐字段对比当前素材与 AI 建议，确认后写入项目"
        size="lg"
      >
        {refillDraft && (
          <RefillDiff
            current={currentRefill}
            draft={refillDraft}
            busy={false}
            onApply={(merged) => applyRefill(merged)}
            onCancel={() => setRefillOpen(false)}
          />
        )}
      </Modal>

      {/* 删除项目 */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除项目"
        description={`删除「${project.name}」将一并移除其证据、表达与技能关联，且不可恢复。`}
        confirmLabel="删除"
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}

// ── 项目资料（概览）：事实 + 证据 + 技能关联 ────────────────────────
function OverviewTab({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const FACTS: [string, string][] = [
    ['概览', project.summary],
    ['背景', project.background],
    ['目标', project.goal],
    ['职责', project.responsibilities],
    ['核心工作', project.core_work],
    ['难点', project.difficulties],
    ['解决方案', project.solutions],
    ['结果与数据', project.results],
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>项目事实</CardTitle>
          <div className="flex items-center gap-2">
            {project.github_url && (
              <a
                href={project.github_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Link2 className="size-3.5" aria-hidden="true" />
                GitHub
              </a>
            )}
            {project.demo_url && (
              <a
                href={project.demo_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Link2 className="size-3.5" aria-hidden="true" />
                Demo
              </a>
            )}
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              删除项目
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {project.tech_stack.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {project.tech_stack.map((t) => (
                <span key={t} className="rounded bg-primary-soft px-2 py-0.5 text-xs text-primary">
                  {t}
                </span>
              ))}
            </div>
          )}
          <dl className="space-y-2.5">
            {FACTS.map(([label, value]) => (
              <div key={label} className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-wrap text-sm leading-relaxed">{value || '（未填写）'}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <EvidenceCard projectId={project.id} />
        <ProjectSkillsCard projectId={project.id} />
      </div>
    </div>
  );
}

// ── 证据管理 ─────────────────────────────────────────────────────────
function EvidenceCard({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = projectKeys.evidence(projectId);
  const { data } = useQuery({ queryKey: key, queryFn: () => listEvidence(projectId) });
  const [form, setForm] = useState({ type: 'github' as Evidence['type'], title: '', url: '', note: '' });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () => createEvidence(projectId, { ...form, note: form.note || null }),
    onSuccess: () => {
      setForm((f) => ({ ...f, title: '', url: '', note: '' }));
      void invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : '添加失败', { variant: 'error' }),
  });
  const del = useMutation({ mutationFn: deleteEvidence, onSuccess: () => void invalidate() });

  return (
    <Card>
      <CardHeader>
        <CardTitle>证据库（{data?.length ?? 0}）</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32">
            <Select<Evidence['type']>
              ariaLabel="证据类型"
              value={form.type}
              onChange={(v) => setForm((f) => ({ ...f, type: v as Evidence['type'] }))}
              options={EVIDENCE_TYPE_ENTRIES.map((e) => ({ value: e.value, label: e.label }))}
            />
          </div>
          <div className="min-w-32 flex-1">
            <Input aria-label="证据标题" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="标题" />
          </div>
          <div className="min-w-40 flex-1">
            <Input aria-label="证据链接" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="链接" />
          </div>
          <Button size="sm" disabled={!form.title.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            <Plus className="size-3.5" aria-hidden="true" />
            添加
          </Button>
        </div>
        <ul className="space-y-1.5">
          {(data ?? []).map((ev) => (
            <li key={ev.id} className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-sm">
              <span className="rounded bg-card px-1.5 py-0.5 text-xs text-muted-foreground">
                {EVIDENCE_TYPE_ENTRIES.find((e) => e.value === ev.type)?.label}
              </span>
              <a href={ev.url || undefined} target="_blank" rel="noreferrer" className="truncate font-medium text-primary hover:underline">
                {ev.title}
              </a>
              {ev.note && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{ev.note}</span>}
              <Button
                aria-label={`删除证据 ${ev.title}`}
                variant="ghost"
                size="sm"
                className="ml-auto size-7 shrink-0 p-0 text-destructive hover:text-destructive"
                onClick={() => del.mutate(ev.id)}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
          {(data ?? []).length === 0 && <li className="text-sm text-muted-foreground">暂无证据——GitHub 仓库、实验数据、截图都是复盘溯源的材料</li>}
        </ul>
      </CardBody>
    </Card>
  );
}

// ── 技能关联 ─────────────────────────────────────────────────────────
function ProjectSkillsCard({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = projectKeys.skills(projectId);
  const { data: linked } = useQuery({ queryKey: key, queryFn: () => getProjectSkills(projectId) });
  const { data: allSkills } = useQuery({ queryKey: skillsKeys.all, queryFn: () => listSkills() });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const unlinked = (allSkills ?? []).filter((s) => !(linked ?? []).some((l) => l.id === s.id));
  const [picked, setPicked] = useState('');

  const mutate = useMutation({
    mutationFn: (ids: string[]) => setProjectSkills(projectId, ids),
    onSuccess: () => void invalidate(),
    onError: (e) => toast(e instanceof Error ? e.message : '关联失败', { variant: 'error' }),
  });

  const addOne = (skillId: string) => {
    if (!skillId) return;
    mutate.mutate([...(linked ?? []).map((s) => s.id), skillId]);
    setPicked('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>技能关联（{linked?.length ?? 0}）</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex gap-2">
          <Select<string>
            ariaLabel="选择技能"
            value={picked}
            onChange={(v) => {
              setPicked(v);
              addOne(v);
            }}
            placeholder={unlinked.length === 0 ? '技能库已全部关联' : '从技能库选择…'}
            options={unlinked.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(linked ?? []).map((s) => (
            <button
              key={s.id}
              title="点击移除关联"
              onClick={() => mutate.mutate((linked ?? []).filter((x) => x.id !== s.id).map((x) => x.id))}
              className="group rounded bg-primary-soft px-2 py-0.5 text-xs text-primary transition-colors hover:bg-destructive-soft hover:text-destructive"
            >
              {s.name}
              <span className="ml-1 opacity-50 group-hover:opacity-100">×</span>
            </button>
          ))}
          {(linked ?? []).length === 0 && <p className="text-sm text-muted-foreground">关联后，AI 生成表达时会优先使用这些技能术语</p>}
        </div>
      </CardBody>
    </Card>
  );
}

// ── 三类表达 Tab：生成 → 待确认 → 历史版本 ──────────────────────────
function ExpressionTab({ projectId, type }: { projectId: string; type: ExpressionType }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = projectKeys.expressions(projectId, type);
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => listExpressions(projectId, type) });

  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => b.version_number - a.version_number),
    [data],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? sorted.find((e) => e.id === selectedId) : sorted[0];

  const task = useAgentTask();
  const running = task.state.phase === 'triggering' || task.state.phase === 'streaming';
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const generate = () => {
    void task.run(() => generateExpression(projectId, type), {
      onDone: () => {
        toast('已生成新版本，等待确认', { variant: 'success' });
        setSelectedId(null);
        void invalidate();
        task.reset();
      },
    });
  };

  const confirm = useMutation({
    mutationFn: (id: string) => patchExpression(id, { status: 'confirmed' }),
    onSuccess: () => {
      toast('已确认', { variant: 'success' });
      void invalidate();
    },
  });

  const saveEdit = (id: string, content: ProjectExpressionContent) => {
    return patchExpression(id, { content }).then(() => {
      toast('已保存编辑', { variant: 'success' });
      void invalidate();
    });
  };

  useEffect(() => {
    // 初次加载与生成完成后回到最新
    setSelectedId(null);
  }, [data]);

  const empty = !isLoading && sorted.length === 0 && !running;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {EXPRESSION_TYPE_ENTRIES.find((e) => e.value === type)?.label}表达：事实经 AI 组织成话术，确认后才会进入简历生成
        </p>
        <Button variant="outline" disabled={running} onClick={() => setConfirmRegen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          生成新版本
        </Button>
      </div>

      {isLoading && <SkeletonList rows={3} />}

      {empty && (
        <EmptyState
          icon={FileText}
          title="还没有此类型的表达"
          description="AI 将基于项目事实与已确认素材生成"
          action={
            <Button onClick={generate}>
              <Plus className="size-4" aria-hidden="true" />
              立即生成
            </Button>
          }
        />
      )}

      {running && (
        <Card>
          <CardHeader>
            <AiDraftBadge confirmed={false} />
            <Button variant="outline" size="sm" onClick={() => void task.cancel()}>
              停止
            </Button>
          </CardHeader>
          <CardBody>
            <StreamText text={task.state.text} streaming thinking={task.state.thinking} />
          </CardBody>
        </Card>
      )}

      {!running && selected && (
        <AIConfirmCard
          text={contentToText(selected.type, selected.content)}
          confirmed={selected.status === 'confirmed'}
          agentRunId={task.state.agent_run_id}
          copyLabel="复制"
          footnote={`v${selected.version_number} · ${new Date(selected.created_at).toLocaleString()}`}
          onConfirm={() => confirm.mutate(selected.id)}
          onSaveEdit={() => setEditorOpen(true)}
          onRegenerate={() => setConfirmRegen(true)}
        />
      )}

      {task.state.phase === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          生成失败：{task.state.error?.message}
        </p>
      )}

      {sorted.length > 1 && (
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">历史版本</h4>
          <ul className="space-y-1">
            {sorted.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setSelectedId(e.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-xs text-muted-foreground">v{e.version_number}</span>
                  <StatusPill entry={EXPRESSION_STATUS_ENTRIES.find((x) => x.value === e.status) ?? EXPRESSION_STATUS_ENTRIES[0]} />
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 重新生成确认 */}
      <ConfirmDialog
        open={confirmRegen}
        onOpenChange={setConfirmRegen}
        title="生成新版本"
        description="AI 将基于当前项目素材生成一个新的草稿版本，不会覆盖已确认版本。"
        confirmLabel="生成"
        onConfirm={() => {
          setConfirmRegen(false);
          generate();
        }}
      />

      {/* 结构化编辑（02 §6.3 三态联合） */}
      {selected && (
        <ExpressionEditorModal
          open={editorOpen}
          onOpenChange={setEditorOpen}
          type={type}
          initial={selected.content}
          onSave={(content) => {
            setEditorOpen(false);
            return saveEdit(selected.id, content);
          }}
        />
      )}
    </div>
  );
}

// ── 表达结构化编辑弹窗 ───────────────────────────────────────────────
const INTERVIEW_FIELDS: [keyof Extract<ProjectExpressionContent, { background: string }>, string][] = [
  ['background', '背景'],
  ['responsibility', '职责'],
  ['architecture', '架构'],
  ['difficulty', '难点'],
  ['solution', '解决方案'],
  ['result', '结果'],
];

const STAR_FIELDS: [keyof Extract<ProjectExpressionContent, { situation: string }>, string][] = [
  ['situation', '情境 (Situation)'],
  ['task', '任务 (Task)'],
  ['action', '行动 (Action)'],
  ['result', '结果 (Result)'],
];

function ExpressionEditorModal({
  open,
  onOpenChange,
  type,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: ExpressionType;
  initial: ProjectExpressionContent;
  onSave: (content: ProjectExpressionContent) => Promise<void>;
}) {
  const [content, setContent] = useState<ProjectExpressionContent>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContent(initial);
  }, [initial, open]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(content);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="编辑表达" description="直接修改结构化字段，生成逻辑不变" size="lg">
      <div className="space-y-3">
        {type === 'resume_bullet' && 'bullets' in content && (
          <Field label="要点（每行一条）" helper="每条 1–2 行，建议含动作 + 数据">
            <Textarea
              aria-label="简历要点"
              rows={6}
              value={content.bullets.join('\n')}
              onChange={(e) => setContent({ bullets: e.target.value.split('\n') })}
            />
          </Field>
        )}
        {type === 'interview' && 'background' in content && (
          <div className="grid gap-3 sm:grid-cols-2">
            {INTERVIEW_FIELDS.map(([key, label]) => (
              <Field key={key} label={label} className={key === 'background' || key === 'solution' ? 'sm:col-span-2' : ''}>
                <Textarea
                  aria-label={label}
                  rows={2}
                  value={content[key]}
                  onChange={(e) => setContent({ ...content, [key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        )}
        {type === 'star' && 'situation' in content && (
          <div className="space-y-3">
            {STAR_FIELDS.map(([key, label]) => (
              <Field key={key} label={label}>
                <Textarea
                  aria-label={label}
                  rows={2}
                  value={content[key]}
                  onChange={(e) => setContent({ ...content, [key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── 编辑项目 ─────────────────────────────────────────────────────────
function EditProjectModal({ project }: { project: Project }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(project);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(project);
  }, [project, open]);

  const save = async () => {
    setSaving(true);
    try {
      await patchProject(project.id, form);
      toast('已保存', { variant: 'success' });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: projectKeys.detail(project.id) });
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof Project>(k: K, v: Project[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Pencil className="size-4" aria-hidden="true" />
        编辑项目
      </Button>
      <Modal open={open} onOpenChange={setOpen} title="编辑项目" description="项目事实是生成与问答的根据，改这里全局生效" size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="项目名称" required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="我的角色">
            <Input value={form.role} onChange={(e) => set('role', e.target.value)} />
          </Field>
          <Field label="起止时间">
            <Input value={form.start_date} onChange={(e) => set('start_date', e.target.value)} placeholder="2024.03 – 2024.09" />
          </Field>
          <Field label="技术栈">
            <TagInput ariaLabel="技术栈" value={form.tech_stack} onChange={(v) => set('tech_stack', v)} placeholder="回车添加" />
          </Field>
          <Field label="概览" className="sm:col-span-2">
            <Textarea rows={2} value={form.summary} onChange={(e) => set('summary', e.target.value)} />
          </Field>
          <Field label="背景" className="sm:col-span-2">
            <Textarea rows={2} value={form.background} onChange={(e) => set('background', e.target.value)} />
          </Field>
          <Field label="目标" className="sm:col-span-2">
            <Textarea rows={2} value={form.goal} onChange={(e) => set('goal', e.target.value)} />
          </Field>
          <Field label="职责" className="sm:col-span-2">
            <Textarea rows={2} value={form.responsibilities} onChange={(e) => set('responsibilities', e.target.value)} />
          </Field>
          <Field label="核心工作" className="sm:col-span-2">
            <Textarea rows={3} value={form.core_work} onChange={(e) => set('core_work', e.target.value)} />
          </Field>
          <Field label="难点" className="sm:col-span-2">
            <Textarea rows={2} value={form.difficulties} onChange={(e) => set('difficulties', e.target.value)} />
          </Field>
          <Field label="解决方案" className="sm:col-span-2">
            <Textarea rows={2} value={form.solutions} onChange={(e) => set('solutions', e.target.value)} />
          </Field>
          <Field label="结果与数据" className="sm:col-span-2">
            <Textarea rows={2} value={form.results} onChange={(e) => set('results', e.target.value)} />
          </Field>
          <Field label="GitHub">
            <Input value={form.github_url ?? ''} onChange={(e) => set('github_url', e.target.value || null)} />
          </Field>
          <Field label="Demo">
            <Input value={form.demo_url ?? ''} onChange={(e) => set('demo_url', e.target.value || null)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button disabled={!form.name.trim()} loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </div>
      </Modal>
    </>
  );
}