/** P6a 简历列表（03 §5 P6）：卡片 + 新建 + ?jd_id= 深链快速生成 */
import { FileText, Plus, Sparkles } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createResume, generateVersion, listResumes, resumeKeys } from '../api/resumes';
import { RESUME_TEMPLATE_ENTRIES } from '../lib/enums';
import { useAgentTask } from '../hooks/useAgentTask';
import { PageHeader } from '../components/layout/page-header';
import { StreamText } from '../components/business/stream-text';
import { Button } from '../components/ui/button';
import { Card, CardBody } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { SkeletonList } from '../components/ui/skeleton';
import { useToast } from '../components/ui/toast';

export function ResumesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const jdId = params.get('jd_id');

  const { data, isLoading } = useQuery({ queryKey: resumeKeys.all, queryFn: () => listResumes() });

  const [open, setOpen] = useState(!!jdId);
  const [form, setForm] = useState({ title: '', target_role: '' });
  const task = useAgentTask();
  const running = task.state.phase === 'triggering' || task.state.phase === 'streaming';

  const quickGenerate = useMemo(
    () => jdId !== null,
    [jdId],
  );

  const createMutation = useMutation({
    mutationFn: () => createResume({ title: form.title || undefined, target_role: form.target_role }),
  });

  const submit = async () => {
    const resume = await createMutation.mutateAsync();
    if (jdId) {
      void task.run(() => generateVersion(resume.id, { jd_id: jdId }), {
        onDone: (s) => {
          toast('定制简历已生成', { variant: 'success' });
          const vid = s.refs['resume_version_id'];
          void qc.invalidateQueries({ queryKey: resumeKeys.all });
          void qc.invalidateQueries({ queryKey: resumeKeys.versions(resume.id) });
          if (vid) {
            navigate(`/resume-versions/${vid}`);
          } else {
            navigate(`/resumes/${resume.id}`);
          }
        },
      });
    } else {
      toast('简历已创建', { variant: 'success' });
      setOpen(false);
      setForm({ title: '', target_role: '' });
      void qc.invalidateQueries({ queryKey: resumeKeys.all });
      navigate(`/resumes/${resume.id}`);
    }
  };

  if (isLoading) return <SkeletonList rows={4} />;

  return (
    <div>
      <PageHeader title="简历" description="每份简历对应一个目标岗位，版本可复盘、可定稿、可导出">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          新建简历
        </Button>
      </PageHeader>

      {data && data.data.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="还没有简历"
          description="创建一份面向目标岗位的简历，AI 从你的资产库组装内容"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              新建简历
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.data ?? []).map((r) => (
            <Link
              key={r.id}
              to={`/resumes/${r.id}`}
              className="rounded-lg border border-border bg-card transition-colors duration-150 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full border-0">
                <CardBody>
                  <h3 className="font-semibold">{r.title || '未命名简历'}</h3>
                  <p className="mt-1 text-sm text-primary">{r.target_role}</p>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      模板：
                      {RESUME_TEMPLATE_ENTRIES.find((e) => e.value === r.template)?.label ?? '未选择'}
                    </span>
                    <span>{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* 新建 / 深链快速生成 */}
      <Modal
        open={open}
        onOpenChange={(o) => !running && setOpen(o)}
        title={quickGenerate ? `为 JD 生成定制简历` : '新建简历'}
        description={quickGenerate ? '创建后 AI 立即根据 JD 画像组装一版定制简历' : '简历内容来自已确认的资产与项目表达'}
      >
        {running ? (
          <div aria-live="polite" aria-busy="true" className="space-y-3">
            <StreamText text={task.state.text} streaming thinking={task.state.thinking} />
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => void task.cancel()}>
                停止
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="目标岗位" required>
              <Input value={form.target_role} onChange={(e) => setForm((f) => ({ ...f, target_role: e.target.value }))} placeholder="如 AI 应用工程师" />
            </Field>
            <Field label="简历标题">
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="如 字节跳动-AI 应用工程师" />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button disabled={!form.target_role.trim()} loading={createMutation.isPending} onClick={() => void submit()}>
                {quickGenerate ? (
                  <>
                    <Sparkles className="size-4" aria-hidden="true" />
                    创建并生成
                  </>
                ) : (
                  '创建'
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}