/** P8 面试问答（03 §5 P8 / 04 §5.6）：复盘记录 + 关联投递自动带出公司岗位 */
import { Mic, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createInterviewQA,
  interviewKeys,
  listInterviewQA,
  patchInterviewQA,
  deleteInterviewQA,
} from '../api/interview-qa';
import { applicationKeys, listApplications } from '../api/applications';
import type { InterviewQA as QA } from '../api/types';
import { PageHeader } from '../components/layout/page-header';
import { MDPreview } from '../components/business/md-preview';
import { Button } from '../components/ui/button';
import { Card, CardBody } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Input, Textarea } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { Select } from '../components/ui/select';
import { SkeletonList } from '../components/ui/skeleton';
import { useToast } from '../components/ui/toast';

const EMPTY_FORM = { application_id: '', company: '', position: '', interview_at: '', question: '', answer: '', note: '' };

export function InterviewsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: interviewKeys.all, queryFn: () => listInterviewQA() });
  const { data: apps } = useQuery({ queryKey: applicationKeys.all, queryFn: () => listApplications({ per_page: 50 }) });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<QA | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: interviewKeys.all });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (qa: QA) => {
    setEditing(qa);
    setForm({
      application_id: qa.application_id ?? '',
      company: qa.company,
      position: qa.position,
      interview_at: qa.interview_at,
      question: qa.question,
      answer: qa.answer,
      note: qa.note ?? '',
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        company: form.company,
        position: form.position,
        interview_at: form.interview_at,
        question: form.question,
        answer: form.answer,
        note: form.note || null,
        application_id: form.application_id || null,
      };
      return editing ? patchInterviewQA(editing.id, body) : createInterviewQA(body);
    },
    onSuccess: () => {
      toast(editing ? '已保存' : '已记录', { variant: 'success' });
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : '保存失败', { variant: 'error' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteInterviewQA(id),
    onSuccess: () => invalidate(),
  });

  const sorted = [...(data ?? [])].sort((a, b) => new Date(b.interview_at).getTime() - new Date(a.interview_at).getTime());

  if (isLoading) return <SkeletonList rows={5} />;

  return (
    <div>
      <PageHeader title="面试问答" description="面完即记：被问了什么、答得如何、下轮改进什么">
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden="true" />
          记录面试
        </Button>
      </PageHeader>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Mic}
          title="还没有面试记录"
          description="每次面试都是复盘素材——记录被问的问题与你的回答，下轮表现更好"
        />
      ) : (
        <div className="space-y-4">
          {sorted.map((qa) => (
            <Card key={qa.id}>
              <CardBody className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">Q: {qa.question}</h3>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {qa.company} · {qa.position} · {new Date(qa.interview_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs font-medium text-muted-foreground">A:</p>
                <MDPreview markdown={qa.answer} plain />
                {qa.note && (
                  <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">复盘：{qa.note}</p>
                )}
                <div className="flex justify-end gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(qa)}>
                    编辑
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => del.mutate(qa.id)}>
                    删除
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? '编辑面试记录' : '记录面试'}
        description="关联投递后自动带出公司/岗位"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="关联投递（可选）" className="sm:col-span-2">
            <Select<string>
              ariaLabel="关联投递"
              value={form.application_id}
              onChange={(v) => {
                const app = apps?.data.find((x) => x.id === v);
                setForm((f) => ({
                  ...f,
                  application_id: v,
                  company: app?.company ?? f.company,
                  position: app?.position ?? f.position,
                }));
              }}
              placeholder="不关联"
              options={(apps?.data ?? []).map((a) => ({
                value: a.id,
                label: `${a.company} · ${a.position}`,
              }))}
            />
          </Field>
          <Field label="公司" required>
            <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
          </Field>
          <Field label="岗位" required>
            <Input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
          </Field>
          <Field label="面试时间">
            <Input type="date" value={form.interview_at} onChange={(e) => setForm((f) => ({ ...f, interview_at: e.target.value }))} />
          </Field>
          <Field label="面试问题" required>
            <Input value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} />
          </Field>
          <Field label="你的回答" className="sm:col-span-2">
            <Textarea rows={4} value={form.answer} onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))} />
          </Field>
          <Field label="复盘备注" className="sm:col-span-2">
            <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="答得好的点 / 下轮改进" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            disabled={!form.company.trim() || !form.position.trim() || !form.question.trim()}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {editing ? '保存' : '记录'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}