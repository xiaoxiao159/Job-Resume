/**
 * P3c JD 详情（03 §5 P3.2 / 04 §5.3）：画像 + 匹配。
 * analyze / match 两个独立任务流；?analyze=1 深链接自动触发分析。
 */
import { FileSearch, Sparkles } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { analyzeJD, getAnalysis, getJD, jdKeys, listMatches, runMatch } from '../api/jd';
import { listProjects, projectKeys } from '../api/projects';
import { useAgentTask } from '../hooks/useAgentTask';
import { ANALYSIS_STATUS_ENTRIES } from '../lib/enums';
import { PageHeader } from '../components/layout/page-header';
import { GapPanel } from '../components/business/gap-panel';
import { MatchList } from '../components/business/match-list';
import { StarRating } from '../components/business/star-rating';
import { StreamText } from '../components/business/stream-text';
import { StatusPill } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { ProgressRing } from '../components/ui/progress-ring';
import { SkeletonList } from '../components/ui/skeleton';
import { Table, TBody, Td, THead, Th, Tr } from '../components/ui/table';
import { useToast } from '../components/ui/toast';

export function JdDetailPage() {
  const { jdId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: jd, isLoading } = useQuery({ queryKey: jdKeys.detail(jdId), queryFn: () => getJD(jdId) });
  const { data: analysis } = useQuery({ queryKey: jdKeys.analysis(jdId), queryFn: () => getAnalysis(jdId) });
  const { data: matches } = useQuery({ queryKey: jdKeys.matches(jdId), queryFn: () => listMatches(jdId) });
  const { data: projects } = useQuery({ queryKey: projectKeys.all, queryFn: () => listProjects() });

  const analyzeTask = useAgentTask();
  const matchTask = useAgentTask();
  const analyzeRunning = analyzeTask.state.phase === 'triggering' || analyzeTask.state.phase === 'streaming';
  const matchRunning = matchTask.state.phase === 'triggering' || matchTask.state.phase === 'streaming';

  const startAnalyze = () => {
    void analyzeTask.run(() => analyzeJD(jdId), {
      onDone: () => {
        toast('分析完成', { variant: 'success' });
        void qc.invalidateQueries({ queryKey: jdKeys.analysis(jdId) });
      },
    });
  };

  const startMatch = () => {
    void matchTask.run(() => runMatch(jdId), {
      onDone: () => {
        toast('匹配完成', { variant: 'success' });
        void qc.invalidateQueries({ queryKey: jdKeys.matches(jdId) });
      },
    });
  };

  // ?analyze=1 深链接：无画像且未在跑时自动触发一次
  useEffect(() => {
    if (!isLoading && searchParams.get('analyze') === '1' && !analysis && !analyzeRunning) {
      startAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, searchParams, analysis]);

  const latestMatch = useMemo(
    () => [...(matches ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0],
    [matches],
  );

  const projectName = (id: string) => projects?.data.find((p) => p.id === id)?.name ?? id;

  if (isLoading || !jd) return <SkeletonList rows={8} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={jd.title || '（未命名）'}
        description={`${jd.company || '公司未知'} · 创建于 ${new Date(jd.created_at).toLocaleDateString()}`}
      >
        <Button variant="outline" onClick={() => navigate(`/resumes?jd_id=${jd.id}`)}>
          生成定制简历
        </Button>
      </PageHeader>

      {/* ── 岗位画像 ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>岗位画像</CardTitle>
          {analysis ? (
            <StatusPill entry={ANALYSIS_STATUS_ENTRIES.find((e) => e.value === analysis.status) ?? ANALYSIS_STATUS_ENTRIES[1]} />
          ) : (
            <Button variant="outline" size="sm" disabled={analyzeRunning} onClick={startAnalyze}>
              <Sparkles className="size-3.5" aria-hidden="true" />
              开始分析
            </Button>
          )}
        </CardHeader>
        <CardBody>
          {analyzeRunning ? (
            <div aria-live="polite" aria-busy="true">
              <StreamText text={analyzeTask.state.text} streaming thinking={analyzeTask.state.thinking} />
              <div className="mt-2">
                <Button variant="outline" size="sm" onClick={() => void analyzeTask.cancel()}>
                  停止
                </Button>
              </div>
            </div>
          ) : !analysis ? (
            <p className="text-sm text-muted-foreground">尚未分析。AI 将拆解核心技能、加分技能、职责与经验要求。</p>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <section aria-label="核心技能">
                  <h4 className="mb-2 text-sm font-semibold">核心技能</h4>
                  <Table>
                    <THead>
                      <Tr>
                        <Th>技能</Th>
                        <Th className="w-32">要求权重</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {analysis.core_skills.map((s) => (
                        <Tr key={s.name}>
                          <Td className="font-medium">{s.name}</Td>
                          <Td>
                            <StarRating stars={s.stars} />
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </section>
                <section aria-label="加分技能">
                  <h4 className="mb-2 text-sm font-semibold">加分技能</h4>
                  <ul className="space-y-1.5">
                    {analysis.plus_skills.map((s) => (
                      <li key={s.name} className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                        <span>{s.name}</span>
                        <StarRating stars={s.stars} />
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <section>
                <h4 className="mb-2 text-sm font-semibold">岗位职责</h4>
                <ul className="list-inside list-disc space-y-1 text-sm leading-relaxed">
                  {analysis.responsibilities.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <span className="font-semibold">经验要求：</span>
                  {analysis.experience_requirement || '—'}
                </div>
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <span className="font-semibold">学历要求：</span>
                  {analysis.education_requirement || '—'}
                </div>
              </div>

              {analysis.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {analysis.keywords.map((k) => (
                    <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── 匹配 ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>匹配结果</CardTitle>
          <Button variant="outline" size="sm" disabled={matchRunning || !analysis} onClick={startMatch}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            重新匹配
          </Button>
        </CardHeader>
        <CardBody>
          {matchRunning ? (
            <div aria-live="polite" aria-busy="true">
              <StreamText text={matchTask.state.text} streaming thinking={matchTask.state.thinking} />
              <div className="mt-2">
                <Button variant="outline" size="sm" onClick={() => void matchTask.cancel()}>
                  停止
                </Button>
              </div>
            </div>
          ) : !latestMatch ? (
            <EmptyState
              icon={FileSearch}
              title="还没有匹配结果"
              description="基于画像与你的技能/项目资产，AI 给出匹配度与差距清单"
              action={
                <Button disabled={!analysis} onClick={startMatch}>
                  {analysis ? '立即匹配' : '请先完成岗位分析'}
                </Button>
              }
            />
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-6">
                <ProgressRing value={latestMatch.overall_score} label="匹配度" />
                <div className="text-sm text-muted-foreground">
                  <p>匹配时间：{new Date(latestMatch.created_at).toLocaleString()}</p>
                  <p>
                    匹配项目：
                    {latestMatch.matched_project_ids.length > 0
                      ? latestMatch.matched_project_ids.map((id) => (
                          <Link key={id} to={`/projects/${id}`} className="text-primary hover:underline">
                            {projectName(id)}
                          </Link>
                        ))
                      : '—'}
                  </p>
                </div>
              </div>

              <MatchList matches={latestMatch.skill_matches} itemLabel="项" />
              <GapPanel advantages={latestMatch.advantages} gaps={latestMatch.gaps} />

              {matches && matches.length > 1 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    历史匹配（{matches.length - 1} 次）
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {[...matches]
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .slice(1)
                      .map((m) => (
                        <li key={m.id} className="text-muted-foreground">
                          {new Date(m.created_at).toLocaleString()} · 匹配度 {m.overall_score}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── 原文 ─────────────────────────────────────────────────── */}
      <details className="rounded-lg border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">JD 原文</summary>
        <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{jd.raw_text}</pre>
      </details>
    </div>
  );
}