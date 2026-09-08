/** P6b 简历详情（03 §5 P6）：版本列表 + 生成定制/通用新版 + 断言入口（工作室） */
import { ArrowRight, FileText, Plus, Sparkles } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { generateVersion, getResume, listVersions, resumeKeys } from '../api/resumes';
import { listJDs, jdKeys } from '../api/jd';
import { REFLECTION_STATUS_ENTRIES, RESUME_TEMPLATE_ENTRIES } from '../lib/enums';
import { useAgentTask } from '../hooks/useAgentTask';
import { PageHeader } from '../components/layout/page-header';
import { StreamText } from '../components/business/stream-text';
import { AiDraftBadge, StatusPill } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Input, Textarea } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { Select } from '../components/ui/select';
import { SkeletonList } from '../components/ui/skeleton';
import { Table, TBody, Td, THead, Th, Tr } from '../components/ui/table';
import { useToast } from '../components/ui/toast';

export function ResumeDetailPage() {
  const { resumeId = '' } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: resume, isLoading } = useQuery({ queryKey: resumeKeys.detail(resumeId), queryFn: () => getResume(resumeId) });
  const { data: versions } = useQuery({ queryKey: resumeKeys.versions(resumeId), queryFn: () => listVersions(resumeId) });
  const { data: jds } = useQuery({ queryKey: jdKeys.all, queryFn: () => listJDs() });

  const task = useAgentTask();
  const running = task.state.phase === 'triggering' || task.state.phase === 'streaming';

  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ jd_id: '', instruction: '' });

  const runGenerate = () => {
    void task.run(
      () => generateVersion(resumeId, { jd_id: genForm.jd_id || null, instruction: genForm.instruction || null }),
      {
        onDone: (s) => {
          toast('新版本已生成，进入工作室确认', { variant: 'success' });
          void qc.invalidateQueries({ queryKey: resumeKeys.versions(resumeId) });
          const vid = s.refs['resume_version_id'];
          if (vid) {
            navigate(`/resume-versions/${vid}`);
          }
          task.reset();
        },
      },
    );
  };

  if (isLoading || !resume) return <SkeletonList rows={6} />;

  const sorted = [...(versions ?? [])].sort((a, b) => b.version_number - a.version_number);

  return (
    <div className="space-y-5">
      <PageHeader
        title={resume.title || '未命名简历'}
        description={`目标岗位：${resume.target_role} · 模板：${RESUME_TEMPLATE_ENTRIES.find((e) => e.value === resume.template)?.label ?? '未选择'}`}
      >
        <Button onClick={() => setGenOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          生成新版本
        </Button>
      </PageHeader>

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

      <Card>
        <CardHeader>
          <CardTitle>版本（{sorted.length}）</CardTitle>
        </CardHeader>
        <CardBody>
          {sorted.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="还没有版本"
              description="通用版直接基于资产库组装；选择 JD 则按岗位画像定制"
              action={
                <Button onClick={() => setGenOpen(true)}>
                  <Sparkles className="size-4" aria-hidden="true" />
                  生成第一个版本
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>版本</Th>
                  <Th>更新时间</Th>
                  <Th className="w-28">复盘</Th>
                  <Th className="w-28">状态</Th>
                  <Th className="w-28 text-right">操作</Th>
                </Tr>
              </THead>
              <TBody>
                {sorted.map((v) => {
                  const recent = sorted[0]?.id === v.id;
                  return (
                    <Tr key={v.id}>
                      <Td>
                        <span className="font-medium text-primary">v{v.version_number}</span>
                        {recent && <span className="ml-2 text-xs text-muted-foreground">（最新）</span>}
                      </Td>
                      <Td className="text-sm text-muted-foreground">{new Date(v.updated_at).toLocaleString()}</Td>
                      <Td>
                        <StatusPill entry={REFLECTION_STATUS_ENTRIES.find((e) => e.value === v.reflection_status) ?? REFLECTION_STATUS_ENTRIES[0]} />
                      </Td>
                      <Td>{v.confirmed_at ? <AiDraftBadge confirmed /> : <AiDraftBadge confirmed={false} />}</Td>
                      <Td className="text-right">
                        <Link to={`/resume-versions/${v.id}`}>
                          <Button variant="outline" size="sm">
                            进入工作室
                            <ArrowRight className="size-3.5" aria-hidden="true" />
                          </Button>
                        </Link>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* 生成新版本 */}
      <Modal
        open={genOpen}
        onOpenChange={(o) => !running && setGenOpen(o)}
        title="生成新版本"
        description="选择 JD 则按岗位画像定制；不选则生成通用版。重生成不覆盖旧版本。"
      >
        <div className="space-y-3">
          <Field label="面向 JD（可选）">
            <Select<string>
              ariaLabel="面向 JD"
              value={genForm.jd_id}
              onChange={(v) => setGenForm((f) => ({ ...f, jd_id: v }))}
              placeholder="通用版（不针对特定 JD）"
              options={(jds?.data ?? []).map((jd) => ({
                value: jd.id,
                label: `${jd.company ?? '?'} · ${jd.title ?? '未命名'}`,
              }))}
            />
          </Field>
          <Field label="附加指令（可选）" helper="如「突出高并发经验」「压缩到一页」">
            <Textarea
              aria-label="附加指令"
              rows={2}
              value={genForm.instruction}
              onChange={(e) => setGenForm((f) => ({ ...f, instruction: e.target.value }))}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setGenOpen(false)}>
              取消
            </Button>
            <Button onClick={runGenerate}>
              <Sparkles className="size-4" aria-hidden="true" />
              生成
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}