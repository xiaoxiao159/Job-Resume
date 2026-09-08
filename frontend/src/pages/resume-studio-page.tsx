/**
 * P6c 简历工作室（03 §5 P6.4 / 04 §5.4）：
 * 段落编辑（SectionAccordion）+ 实时 Markdown 预览 / 后端 HTML 预览 + 模板 +
 * 复盘验证（ReflectionPanel 点击定位）+ 确认定稿（锁定）+ 导出。
 */
import { Check, Download, Lock, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  confirmVersion,
  exportVersion,
  getResume,
  getVersion,
  patchResume,
  patchVersionContent,
  previewVersion,
  reflectVersion,
  regenerateVersion,
  resumeKeys,
} from '../api/resumes';
import { downloadBlob } from '../lib/download';
import { buildResumeMarkdown } from '../lib/resume-render';
import { useAgentTask } from '../hooks/useAgentTask';
import type { ResumeContent, ResumeTemplate } from '../api/types';
import { PageHeader } from '../components/layout/page-header';
import { MDPreview } from '../components/business/md-preview';
import { ReflectionPanel } from '../components/business/reflection-panel';
import { ResumePreviewFrame } from '../components/business/resume-preview-frame';
import { SectionAccordion } from '../components/business/section-accordion';
import { StreamText } from '../components/business/stream-text';
import { TemplatePicker } from '../components/business/template-picker';
import { AiDraftBadge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { SkeletonList } from '../components/ui/skeleton';
import { Tabs } from '../components/ui/tabs';
import { useToast } from '../components/ui/toast';

export function ResumeStudioPage() {
  const { versionId = '' } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: version, isLoading } = useQuery({ queryKey: resumeKeys.version(versionId), queryFn: () => getVersion(versionId) });
  const { data: resume } = useQuery({
    queryKey: resumeKeys.detail(version?.resume_id ?? ''),
    queryFn: () => getResume(version!.resume_id),
    enabled: !!version,
  });

  // ── 本地编辑副本 ───────────────────────────────────────────────────
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (version) {
      setContent(version.content);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id]);

  const locked = !!version?.confirmed_at;

  const saveMutation = useMutation({
    mutationFn: () => patchVersionContent(versionId, content!),
    onSuccess: () => {
      setDirty(false);
      toast('已保存', { variant: 'success' });
      void qc.invalidateQueries({ queryKey: resumeKeys.version(versionId) });
      void qc.invalidateQueries({ queryKey: resumeKeys.versions(version?.resume_id ?? '') });
    },
    onError: (e) => {
      const isLocked = e instanceof Error && 'code' in e && (e as { code: string }).code === 'locked_version';
      toast(isLocked ? '该版本已定稿，内容锁定不可编辑' : e instanceof Error ? e.message : '保存失败', { variant: 'error' });
    },
  });

  // ── 复盘任务 ───────────────────────────────────────────────────────
  const reflectTask = useAgentTask();
  const reflectRunning = reflectTask.state.phase === 'triggering' || reflectTask.state.phase === 'streaming';
  const runReflect = () => {
    void reflectTask.run(() => reflectVersion(versionId), {
      onDone: () => {
        toast('复盘完成', { variant: 'success' });
        void qc.invalidateQueries({ queryKey: resumeKeys.version(versionId) });
        reflectTask.reset();
      },
    });
  };

  // ── 定稿 / 重新生成 ────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const regenTask = useAgentTask();
  const regenRunning = regenTask.state.phase === 'triggering' || regenTask.state.phase === 'streaming';

  const confirmMutation = useMutation({
    mutationFn: () => confirmVersion(versionId),
    onSuccess: () => {
      toast('已定稿，内容锁定', { variant: 'success' });
      setConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: resumeKeys.version(versionId) });
      void qc.invalidateQueries({ queryKey: resumeKeys.versions(version?.resume_id ?? '') });
    },
    onError: (e) => toast(e instanceof Error ? e.message : '定稿失败', { variant: 'error' }),
  });

  const runRegen = () => {
    void regenTask.run(() => regenerateVersion(versionId, { instruction: null }), {
      onDone: (s) => {
        toast('已生成新版本', { variant: 'success' });
        void qc.invalidateQueries({ queryKey: resumeKeys.versions(version?.resume_id ?? '') });
        const vid = s.refs['resume_version_id'];
        if (vid) navigate(`/resume-versions/${vid}`);
        regenTask.reset();
      },
    });
  };

  // ── 模板 ───────────────────────────────────────────────────────────
  const patchTemplate = useMutation({
    mutationFn: (template: ResumeTemplate) => patchResume(version!.resume_id, { template }),
    onSuccess: () => {
      toast('模板已切换', { variant: 'success' });
      void qc.invalidateQueries({ queryKey: resumeKeys.detail(version!.resume_id) });
    },
  });

  // ── HTML 预览（后端渲染，需先选模板）───────────────────────────────
  const [previewMode, setPreviewMode] = useState('md');
  const htmlPreview = useQuery({
    queryKey: ['preview-version', versionId, 'html', resume?.template],
    queryFn: () => previewVersion(versionId, 'html'),
    enabled: previewMode === 'html' && !!resume?.template,
    retry: false,
  });

  // ── 导出 ───────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState<'html' | 'pdf' | null>(null);
  const doExport = async (format: 'html' | 'pdf') => {
    if (!resume?.template) {
      toast('请先选择模板再导出', { variant: 'info' });
      setPreviewMode('html');
      return;
    }
    setExporting(format);
    try {
      const { blob, filename } = await exportVersion(versionId, format);
      downloadBlob(blob, filename);
      toast('已开始下载', { variant: 'success' });
    } catch (e) {
      toast(e instanceof Error ? e.message : '导出失败', { variant: 'error' });
    } finally {
      setExporting(null);
    }
  };

  const markdown = useMemo(() => (content ? buildResumeMarkdown(content) : ''), [content]);

  if (isLoading || !version || !content) return <SkeletonList rows={10} />;

  const pendingReflection = !locked && version.reflection_status === 'pending';

  return (
    <div>
      <PageHeader
        title={`${resume?.title ?? '简历'} · v${version.version_number}`}
        description={
          locked
            ? '该版本已定稿 · 内容锁定'
            : `${resume?.target_role ?? ''} · 编辑中以本地副本为准，记得保存`
        }
      >
        {!locked && (
          <Button disabled={!dirty} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <Save className="size-4" aria-hidden="true" />
            {dirty ? '保存修改' : '已保存'}
          </Button>
        )}
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
          <ShieldCheck className="size-4" aria-hidden="true" />
          确认定稿
        </Button>
        <Button variant="outline" onClick={() => setRegenOpen(true)} disabled={regenRunning}>
          <RefreshCw className="size-4" aria-hidden="true" />
          重新生成
        </Button>
      </PageHeader>

      {regenRunning && (
        <Card className="mb-4">
          <CardBody>
            <StreamText text={regenTask.state.text} streaming thinking={regenTask.state.thinking} />
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => void regenTask.cancel()}>
                停止
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {locked && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-warning-soft bg-warning-soft/50 px-3 py-2 text-sm text-warning">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          已定稿（{version.confirmed_at ? new Date(version.confirmed_at).toLocaleString() : ''}）：段落不可再编辑。如需调整，请「重新生成」新版本，旧版本保留。
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* 左：段落编辑 */}
        <div className="min-w-0">
          {locked ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <MDPreview markdown={markdown} ariaLabel="已定稿简历内容" />
            </div>
          ) : (
            <SectionAccordion
              content={content}
              onChange={(c) => {
                setContent(c);
                setDirty(true);
              }}
              readOnly={locked}
            />
          )}

          {!locked && (
            <div className="mt-3 flex justify-end">
              <Button disabled={!dirty} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                <Save className="size-4" aria-hidden="true" />
                保存修改
              </Button>
            </div>
          )}
        </div>

        {/* 右：预览 / 模板 / 复盘 */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>预览</CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" loading={exporting === 'html'} onClick={() => void doExport('html')}>
                  <Download className="size-3.5" aria-hidden="true" />
                  导出 HTML
                </Button>
                <Button variant="outline" size="sm" loading={exporting === 'pdf'} onClick={() => void doExport('pdf')}>
                  <Download className="size-3.5" aria-hidden="true" />
                  导出 PDF
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              <Tabs
                value={previewMode}
                onChange={setPreviewMode}
                ariaLabel="预览格式"
                items={[
                  { value: 'md', label: 'Markdown' },
                  { value: 'html', label: 'HTML' },
                ]}
              />
              <div className="mt-3 h-[28rem] overflow-y-auto rounded-md border border-border bg-card p-4">
                {previewMode === 'md' ? (
                  <MDPreview markdown={markdown} ariaLabel="简历 Markdown 预览" />
                ) : !resume?.template ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <p>HTML 预览与导出需先选择模板</p>
                  </div>
                ) : htmlPreview.isLoading || htmlPreview.isFetching ? (
                  <SkeletonList rows={8} />
                ) : htmlPreview.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    预览失败：{htmlPreview.error instanceof Error ? htmlPreview.error.message : '未知错误'}
                  </p>
                ) : (
                  <ResumePreviewFrame html={htmlPreview.data ?? ''} className="h-full" />
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>模板</CardTitle>
            </CardHeader>
            <CardBody>
              <TemplatePicker value={resume?.template ?? null} onChange={(t) => patchTemplate.mutate(t)} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                复盘验证
                {version.confirmed_at && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-accent">
                    <Check className="size-3.5" aria-hidden="true" />
                    已定稿
                  </span>
                )}
              </CardTitle>
              <AiDraftBadge confirmed={!!version.confirmed_at} />
            </CardHeader>
            <CardBody>
              <ReflectionPanel
                status={version.reflection_status}
                result={version.reflection_result}
                running={reflectRunning}
                onRun={runReflect}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      {/* 定稿确认 */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="确认定稿"
        description={
          pendingReflection
            ? '本版本尚未通过复盘验证，定稿后将锁定内容。仍要定稿吗？'
            : '定稿后段落与模板之外的内容将锁定，不再可编辑。'
        }
        confirmLabel="定稿"
        danger={false}
        onConfirm={() => confirmMutation.mutate()}
      />

      {/* 重新生成确认 */}
      <ConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="重新生成"
        description="AI 将基于当前素材生成一个全新版本（旧版本保留）。"
        confirmLabel="生成"
        danger={false}
        onConfirm={() => {
          setRegenOpen(false);
          runRegen();
        }}
      />
    </div>
  );
}