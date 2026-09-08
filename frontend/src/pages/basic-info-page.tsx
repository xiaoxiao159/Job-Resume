/** P2 基本信息（03 §5 P2 / 04 §5.2）：单例表单 + 自我评价 AI 润色 */
import { Sparkles } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { basicInfoKeys, getBasicInfo, polishSelfEval, putBasicInfo } from '../api/basic-info';
import { useAgentTask } from '../hooks/useAgentTask';
import type { BasicInfo } from '../api/types';
import { AVAILABILITY_ENTRIES } from '../lib/enums';
import { PageHeader } from '../components/layout/page-header';
import { Card, CardBody } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input, Textarea } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { SkeletonList } from '../components/ui/skeleton';
import { AIConfirmCard } from '../components/business/ai-confirm-card';
import { useToast } from '../components/ui/toast';

const EMPTY: BasicInfo = {
  name: '',
  email: '',
  phone: '',
  github_url: null,
  homepage_url: null,
  job_role: '',
  city: '',
  availability: 'undecided',
  self_evaluation: '',
};

export function BasicInfoPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: basicInfoKeys.all, queryFn: getBasicInfo });

  const [form, setForm] = useState<BasicInfo>(EMPTY);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => putBasicInfo(form),
    onSuccess: () => {
      toast('已保存', { variant: 'success' });
      void qc.invalidateQueries({ queryKey: basicInfoKeys.all });
    },
    onError: (e) => toast(e instanceof Error ? e.message : '保存失败', { variant: 'error' }),
  });

  // AI 润色自我评价（04 §5.2 决策 #2：独立端点，产物 = 回填建议）
  const task = useAgentTask();

  const set = <K extends keyof BasicInfo>(k: K, v: BasicInfo[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <SkeletonList rows={6} />;

  return (
    <div>
      <PageHeader title="基本信息" description="简历与投递邮件的唯一事实来源">
        <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          保存
        </Button>
      </PageHeader>

      <Card>
        <CardBody className="space-y-4 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="姓名" required>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="张三" />
            </Field>
            <Field label="求职角色" required>
              <Input value={form.job_role} onChange={(e) => set('job_role', e.target.value)} placeholder="如 AI 应用工程师" />
            </Field>
            <Field label="邮箱" required>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="电话" required>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="GitHub">
              <Input value={form.github_url ?? ''} onChange={(e) => set('github_url', e.target.value || null)} placeholder="https://github.com/..." />
            </Field>
            <Field label="个人主页">
              <Input value={form.homepage_url ?? ''} onChange={(e) => set('homepage_url', e.target.value || null)} placeholder="博客 / 作品集" />
            </Field>
            <Field label="城市">
              <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="到岗时间">
              <Select
                value={form.availability}
                onChange={(v) => set('availability', v as BasicInfo['availability'])}
                options={AVAILABILITY_ENTRIES.map((e) => ({ value: e.value, label: e.label }))}
                ariaLabel="到岗时间"
              />
            </Field>
          </div>

          <Field label="自我评价" helper="交给 AI 润色：尊重事实、只改表达">
            <Textarea
              rows={4}
              value={form.self_evaluation}
              onChange={(e) => set('self_evaluation', e.target.value)}
              placeholder="两三句话介绍自己：方向、积累与优势"
            />
          </Field>

          {/* 润色任务流（生成 → 待确认 → 确认回写） */}
          {task.state.phase !== 'idle' && task.state.phase !== 'cancelled' && (
            <AIConfirmCard
              text={task.state.text}
              streaming={task.state.phase === 'streaming'}
              thinking={task.state.thinking}
              confirmed={false}
              agentRunId={task.state.agent_run_id}
              actions={['confirm', 'regenerate']}
              copyLabel="复制润色版"
              footnote="仅改写表达，未新增事实。确认后写入基本信息。"
              onConfirm={() => {
                set('self_evaluation', task.state.text);
                toast('已写入自我评价，记得点顶部「保存」', { variant: 'success' });
                task.reset();
              }}
              onSaveEdit={(v) => {
                set('self_evaluation', v);
                task.reset();
              }}
              onRegenerate={() => {
                task.reset();
                void task.run(() => polishSelfEval());
              }}
            />
          )}
          {task.state.phase === 'idle' && (
            <Button variant="outline" onClick={() => void task.run(() => polishSelfEval())}>
              <Sparkles className="size-4" aria-hidden="true" />
              AI 润色自我评价
            </Button>
          )}
          {task.state.phase === 'error' && (
            <p role="alert" className="text-sm text-destructive">
              润色失败：{task.state.error?.message}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}