/** P5 HR 助手（03 §5 P5 / 04 §5.5）：按场景生成打招呼语，生成即存档，可微调 */
import { MessagesSquare, Sparkles } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { generateHRMessage, hrKeys, listHRMessages } from '../api/hr-messages';
import { listJDs, jdKeys } from '../api/jd';
import { listResumes, listVersions, resumeKeys } from '../api/resumes';
import { HR_MODE_ENTRIES, HR_SCENE_ENTRIES } from '../lib/enums';
import { useAgentTask } from '../hooks/useAgentTask';
import type { HrMode, HrScene } from '../api/types';
import { PageHeader } from '../components/layout/page-header';
import { AIConfirmCard } from '../components/business/ai-confirm-card';
import { RadioCards } from '../components/ui/radio-cards';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Select } from '../components/ui/select';
import { SkeletonList } from '../components/ui/skeleton';
import { useToast } from '../components/ui/toast';

export function HrPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: jds } = useQuery({ queryKey: jdKeys.all, queryFn: () => listJDs() });
  const { data: resumes } = useQuery({ queryKey: resumeKeys.all, queryFn: () => listResumes() });
  const { data: messages, isLoading } = useQuery({ queryKey: hrKeys.all, queryFn: () => listHRMessages() });

  const [form, setForm] = useState({ jd_id: '', resume_version_id: '', scene: 'boss_zhipin' as HrScene, mode: 'standard' as HrMode });

  const task = useAgentTask();
  const running = task.state.phase === 'triggering' || task.state.phase === 'streaming';

  // 选中简历后加载其版本（供简历版本下拉）
  const [pickedResumeId, setPickedResumeId] = useState('');
  const [resumeVersions, setResumeVersions] = useState<{ value: string; label: string }[]>([]);
  const loadVersions = async (resumeId: string) => {
    setPickedResumeId(resumeId);
    if (!resumeId) {
      setResumeVersions([]);
      setForm((f) => ({ ...f, resume_version_id: '' }));
      return;
    }
    const rows = await listVersions(resumeId);
    setResumeVersions(rows.map((v) => ({ value: v.id, label: `v${v.version_number} · ${new Date(v.updated_at).toLocaleDateString()}` })));
  };

  const runGenerate = () => {
    void task.run(
      () =>
        generateHRMessage({
          jd_id: form.jd_id || null,
          resume_version_id: form.resume_version_id || null,
          scene: form.scene,
          mode: form.mode,
        }),
      {
        onDone: () => {
          toast('已生成并保存到消息列表', { variant: 'success' });
          void qc.invalidateQueries({ queryKey: hrKeys.all });
          task.reset();
        },
      },
    );
  };

  const sorted = [...(messages ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="space-y-5">
      <PageHeader title="HR 助理" description="按渠道与深度生成打招呼语，生成即存档、随时微调" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <Card>
          <CardHeader>
            <CardTitle>生成打招呼语</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="关联 JD（可选）" helper="选择后可让消息更贴岗位">
                <Select<string>
                  ariaLabel="关联 JD"
                  value={form.jd_id}
                  onChange={(v) => setForm((f) => ({ ...f, jd_id: v, resume_version_id: '' }))}
                  placeholder="不关联（通用打招呼）"
                  options={(jds?.data ?? []).map((jd) => ({
                    value: jd.id,
                    label: `${jd.company ?? '?'} · ${jd.title ?? '未命名'}`,
                  }))}
                />
              </Field>
              <Field label="附上简历版本（可选）">
                <Select<string>
                  ariaLabel="简历版本"
                  value={form.resume_version_id}
                  onChange={(v) => setForm((f) => ({ ...f, resume_version_id: v }))}
                  placeholder="不带简历"
                  disabled={resumeVersions.length === 0}
                  options={resumeVersions}
                />
              </Field>
            </div>

            <Field label="附上简历版本（可选）">
              <div className="flex gap-2">
                <Select<string>
                  ariaLabel="选择简历"
                  value={pickedResumeId}
                  onChange={(v) => void loadVersions(v)}
                  placeholder={resumes && resumes.data.length === 0 ? '还没有简历' : '不附带简历'}
                  options={(resumes?.data ?? []).map((r) => ({ value: r.id, label: r.title || r.target_role }))}
                  className="flex-1"
                />
                <Select<string>
                  ariaLabel="简历版本"
                  value={form.resume_version_id}
                  onChange={(v) => setForm((f) => ({ ...f, resume_version_id: v }))}
                  placeholder={resumeVersions.length === 0 ? '先选择简历' : '不带具体版本'}
                  disabled={resumeVersions.length === 0}
                  options={resumeVersions}
                  className="flex-1"
                />
              </div>
            </Field>

            <Field label="沟通场景">
              <RadioCards<HrScene>
                value={form.scene}
                onChange={(v) => setForm((f) => ({ ...f, scene: v }))}
                options={HR_SCENE_ENTRIES.map((e) => ({ value: e.value, label: e.label }))}
                ariaLabel="沟通场景"
              />
            </Field>
            <Field label="深度">
              <RadioCards<HrMode>
                value={form.mode}
                onChange={(v) => setForm((f) => ({ ...f, mode: v }))}
                options={HR_MODE_ENTRIES.map((e) => ({ value: e.value, label: e.label }))}
                ariaLabel="消息深度"
              />
            </Field>

            {task.state.phase === 'idle' && (
              <Button onClick={runGenerate}>
                <Sparkles className="size-4" aria-hidden="true" />
                生成
              </Button>
            )}
          </CardBody>
        </Card>

        {/* 生成结果（确认后存档） */}
        {task.state.phase !== 'idle' && task.state.phase !== 'cancelled' && (
          <AIConfirmCard
            text={task.state.text}
            streaming={running}
            thinking={task.state.thinking}
            agentRunId={task.state.agent_run_id}
            className="self-start"
            copyLabel="复制到剪贴板"
            footnote="生成成功即自动存档；编辑保存后会覆盖存档内容"
            onConfirm={() => {
              toast('已存档到消息列表', { variant: 'success' });
              task.reset();
            }}
            onSaveEdit={() => {
              task.reset();
              toast('已生成的消息可在「消息列表」点开修改', { variant: 'info' });
            }}
            onRegenerate={() => {
              task.reset();
              runGenerate();
            }}
          />
        )}
      </div>

      {/* 消息列表 */}
      <Card>
        <CardHeader>
          <CardTitle>消息列表（{sorted.length}）</CardTitle>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <SkeletonList rows={3} />
          ) : sorted.length === 0 ? (
            <EmptyState icon={MessagesSquare} title="还没有消息" description="生成后的打招呼语会保存在这里，可反复修改复用" />
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link to={`/hr/${m.id}`} className="block truncate text-sm font-medium hover:text-primary">
                      {m.content.split('\n')[0]}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {HR_SCENE_ENTRIES.find((e) => e.value === m.scene)?.label} ·{' '}
                      {HR_MODE_ENTRIES.find((e) => e.value === m.mode)?.label} · {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Link to={`/hr/${m.id}`} className="text-sm text-primary hover:underline">
                    详情
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}