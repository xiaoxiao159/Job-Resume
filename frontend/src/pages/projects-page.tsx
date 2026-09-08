/** P4 项目列表（03 §5 P4）：卡片网格 + 新建 */
import { FolderKanban, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createProject, listProjects, projectKeys } from '../api/projects';
import { PageHeader } from '../components/layout/page-header';
import { Button } from '../components/ui/button';
import { Card, CardBody } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { SkeletonList } from '../components/ui/skeleton';
import { useToast } from '../components/ui/toast';

export function ProjectsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: projectKeys.all, queryFn: () => listProjects() });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', summary: '', role: '', start_date: '', end_date: '' });

  const create = useMutation({
    mutationFn: () =>
      createProject({
        name: form.name,
        summary: form.summary,
        background: '',
        goal: '',
        start_date: form.start_date,
        end_date: form.end_date,
        role: form.role,
        tech_stack: [],
        responsibilities: '',
        core_work: '',
        difficulties: '',
        solutions: '',
        results: '',
        github_url: null,
        demo_url: null,
      }),
    onSuccess: () => {
      toast('项目已创建', { variant: 'success' });
      setCreateOpen(false);
      setForm({ name: '', summary: '', role: '', start_date: '', end_date: '' });
      void qc.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (e) => toast(e instanceof Error ? e.message : '创建失败', { variant: 'error' }),
  });

  if (isLoading) return <SkeletonList rows={4} />;

  return (
    <div>
      <PageHeader title="项目助手" description="项目是简历生成与面试问答的素材源头">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          新建项目
        </Button>
      </PageHeader>

      {data && data.data.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="还没有项目"
          description="先录入项目素材，AI 才能导出高质量的项目表达"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              新建项目
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(data?.data ?? []).map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="rounded-lg border border-border bg-card transition-colors duration-150 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full border-0">
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    {p.start_date && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {p.start_date} – {p.end_date || '至今'}
                      </span>
                    )}
                  </div>
                  {p.role && <p className="mt-0.5 text-xs text-muted-foreground">角色：{p.role}</p>}
                  {p.summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>}
                  {p.tech_stack.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {p.tech_stack.slice(0, 5).map((t) => (
                        <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={createOpen} onOpenChange={setCreateOpen} title="新建项目" description="先记名字与梗概，细节在项目页逐项补全">
        <div className="space-y-3">
          <Field label="项目名称" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="如 智能简历解析 Agent" />
          </Field>
          <Field label="一句话概览" helper="AI 问答会围绕它展开">
            <Input value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="我的角色">
              <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="如 核心开发" />
            </Field>
            <Field label="起止时间">
              <Input value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} placeholder="2024.03 – 2024.09" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button disabled={!form.name.trim()} loading={create.isPending} onClick={() => create.mutate()}>
              创建
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}