/**
 * P7 投递记录（03 §5 P7 / 04 §5.6）：状态筛选 + 快速流转 + 简历版本关联。
 * 深链接 /applications?status=interview,offer（03 §3.3）。
 */
import { Plus, Send } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  applicationKeys,
  createApplication,
  deleteApplication,
  listApplications,
  patchApplication,
} from '../api/applications';
import { listResumes, listVersions, resumeKeys } from '../api/resumes';
import type { Application, ApplicationStatus } from '../api/types';
import { APPLICATION_STATUS_ENTRIES } from '../lib/enums';
import { PageHeader } from '../components/layout/page-header';
import { StatusPill } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { Select } from '../components/ui/select';
import { SkeletonList } from '../components/ui/skeleton';
import { Table, TBody, Td, THead, Th, Tr } from '../components/ui/table';
import { useToast } from '../components/ui/toast';

export function ApplicationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const statusFilter = searchParams.get('status') ?? '';
  const [page] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: applicationKeys.list({
      page,
      q: q || undefined,
      status: statusFilter || undefined,
    }),
    queryFn: () => listApplications({ page, q: q || undefined, status: statusFilter || undefined }),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ company: '', position: '', status: 'to_apply' as ApplicationStatus, applied_at: '', note: '', resume_version_id: '' });
  const [pickedResumeId, setPickedResumeId] = useState('');
  const [versions, setVersions] = useState<{ value: string; label: string }[]>([]);
  const { data: resumes } = useQuery({ queryKey: resumeKeys.all, queryFn: () => listResumes() });

  // 行级字段错误（03 §4.4 就地显示）
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: applicationKeys.all });
  };

  const create = useMutation({
    mutationFn: () =>
      createApplication({
        company: form.company,
        position: form.position,
        status: form.status,
        applied_at: form.applied_at || null,
        note: form.note || null,
        resume_version_id: form.resume_version_id || null,
      }),
    onSuccess: () => {
      toast('已添加', { variant: 'success' });
      setCreateOpen(false);
      setForm({ company: '', position: '', status: 'to_apply', applied_at: '', note: '', resume_version_id: '' });
      invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : '添加失败', { variant: 'error' }),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Application> }) => patchApplication(id, body),
    onSuccess: () => {
      setRowErrors({});
      invalidate();
    },
    onError: (e, vars) => {
      const fieldErrors = e instanceof Error ? (e as { fieldErrors?: Record<string, string> }).fieldErrors : undefined;
      if (fieldErrors) {
        setRowErrors({ [vars.id]: fieldErrors['applied_at'] ?? '请补充投递时间' });
      } else {
        toast(e instanceof Error ? e.message : '更新失败', { variant: 'error' });
      }
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteApplication(id),
    onSuccess: () => invalidate(),
  });

  const toggleStatus = (v: ApplicationStatus) => {
    const cur = statusFilter ? statusFilter.split(',') : [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    if (next.length === 0) {
      searchParams.delete('status');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ status: next.join(',') });
    }
  };

  if (isLoading) return <SkeletonList rows={5} />;

  const rows = data?.data ?? [];
  const statusEntries = APPLICATION_STATUS_ENTRIES;

  return (
    <div>
      <PageHeader title="投递记录" description="从 JD 到 Offer 的漏斗落点，状态随手更新">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          添加投递
        </Button>
      </PageHeader>

      {/* 筛选条：全量 + 常用状态复选（深链接 /applications?status=a,b） */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant={!statusFilter ? 'secondary' : 'ghost'} size="sm" onClick={() => setSearchParams({})}>
          全部
        </Button>
        {statusEntries.map((e) => (
          <Button
            key={e.value}
            variant={statusFilter.split(',').includes(e.value) ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => toggleStatus(e.value)}
          >
            {e.label}
          </Button>
        ))}
        <div className="ml-auto w-56">
          <Input aria-label="搜索公司或职位" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索公司或职位…" />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Send}
          title="没有投递记录"
          description="从 JD 详情「生成定制简历」开始，投出去就记一笔"
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>公司 / 职位</Th>
              <Th className="w-40">状态</Th>
              <Th className="w-36">投递时间</Th>
              <Th className="w-52">简历版本</Th>
              <Th className="w-16 text-right">操作</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((app) => (
              <Tr key={app.id}>
                <Td>
                  <p className="font-medium">{app.position}</p>
                  <p className="text-xs text-muted-foreground">{app.company}</p>
                  {app.note && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{app.note}</p>}
                  {rowErrors[app.id] && (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {rowErrors[app.id]}
                    </p>
                  )}
                </Td>
                <Td>
                  <Select<ApplicationStatus>
                    inline
                    ariaLabel="状态"
                    value={app.status}
                    onChange={(v) => patch.mutate({ id: app.id, body: { status: v as ApplicationStatus, applied_at: app.applied_at } })}
                    options={statusEntries.map((e) => ({ value: e.value, label: e.label }))}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label="投递时间"
                    type="date"
                    value={app.applied_at ?? ''}
                    invalid={!!rowErrors[app.id]}
                    onChange={(e) => patch.mutate({ id: app.id, body: { applied_at: e.target.value || null } })}
                  />
                </Td>
                <Td>
                  {app.resume_version_id && (
                    <span className="text-sm text-muted-foreground">
                      {app.resume_version ? `${app.resume_version.resume_title} · v${app.resume_version.version_number}` : app.resume_version_id.slice(0, 8)}
                    </span>
                  )}
                  {!app.resume_version_id && app.resume_version && (
                    <span className="text-sm">
                      {app.resume_version.resume_title} · v{app.resume_version.version_number}
                    </span>
                  )}
                  {!app.resume_version_id && !app.resume_version && <span className="text-muted-foreground">—</span>}
                </Td>
                <Td className="text-right">
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => del.mutate(app.id)}>
                    删除
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      {data && data.meta.total_pages > 1 && (
        <p className="mt-2 text-xs text-muted-foreground">
          第 {data.meta.page}/{data.meta.total_pages} 页 · 共 {data.meta.total} 条
        </p>
      )}

      {/* 新增投递 */}
      <Modal open={createOpen} onOpenChange={setCreateOpen} title="添加投递" description="记录一次投递行为，支持关联简历版本">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="公司" required>
            <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
          </Field>
          <Field label="职位" required>
            <Input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
          </Field>
          <Field label="状态">
            <Select<ApplicationStatus>
              ariaLabel="状态"
              value={form.status}
              onChange={(v) => setForm((f) => ({ ...f, status: v as ApplicationStatus }))}
              options={statusEntries.map((e) => ({ value: e.value, label: e.label }))}
            />
          </Field>
          <Field label="投递时间" helper={form.status !== 'to_apply' ? '状态非「待投递」时必填' : undefined}>
            <Input type="date" value={form.applied_at} onChange={(e) => setForm((f) => ({ ...f, applied_at: e.target.value }))} />
          </Field>
          <Field label="简历（可选）">
            <Select<string>
              ariaLabel="选择简历"
              value={pickedResumeId}
              onChange={(v) => {
                setPickedResumeId(v);
                setForm((f) => ({ ...f, resume_version_id: '' }));
                if (v) void listVersions(v).then((rows) => setVersions(rows.map((x) => ({ value: x.id, label: `v${x.version_number}` }))));
                else setVersions([]);
              }}
              placeholder="不关联"
              options={(resumes?.data ?? []).map((r) => ({ value: r.id, label: r.title || r.target_role }))}
            />
          </Field>
          <Field label="简历版本（可选）">
            <Select<string>
              ariaLabel="简历版本"
              value={form.resume_version_id}
              onChange={(v) => setForm((f) => ({ ...f, resume_version_id: v }))}
              placeholder={versions.length === 0 ? '先选择简历' : '不关联'}
              disabled={versions.length === 0}
              options={versions}
            />
          </Field>
          <Field label="备注" className="sm:col-span-2">
            <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="渠道、内推人等" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" onClick={() => setCreateOpen(false)}>
            取消
          </Button>
          <Button disabled={!form.company.trim() || !form.position.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            添加
          </Button>
        </div>
      </Modal>
    </div>
  );
}

