/**
 * ReflectionPanel（03 §5 P6.3 / 05 §4.5）：复盘验证面板。
 * 匹配得分 ProgressBar + 关键词覆盖命中/缺失 + 事实核查问题列表（点击 → 简历定位高亮）。
 */
import { CircleCheck, CircleX, NotebookPen } from 'lucide-react';
import type { ReflectionResult, ReflectionStatus } from '../../api/types';
import { REFLECTION_STATUS_ENTRIES } from '../../lib/enums';
import { StatusPill } from '../ui/badge';
import { Button } from '../ui/button';
import { ProgressBar } from '../ui/progress-ring';
import { EmptyState } from '../ui/empty-state';
import { SkeletonList } from '../ui/skeleton';
import { scrollToAziLoc } from './md-preview';
import { useToast } from '../ui/toast';

interface ReflectionPanelProps {
  status: ReflectionStatus;
  result: ReflectionResult | null;
  /** 复盘任务进行中 */
  running?: boolean;
  onRun: () => void;
}

export function ReflectionPanel({ status, result, running, onRun }: ReflectionPanelProps) {
  const { toast } = useToast();
  const statusEntry = REFLECTION_STATUS_ENTRIES.find((e) => e.value === status) ?? REFLECTION_STATUS_ENTRIES[0];

  if (running) {
    return (
      <div aria-busy="true" className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <StatusPill entry={statusEntry} />
          <span className="text-sm text-muted-foreground">正在复盘：审查事实、核对量化数据…</span>
        </div>
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (!result) {
    return (
      <EmptyState
        icon={NotebookPen}
        title={status === 'passed' ? '验证已通过' : '尚未验证'}
        description="让 Agent 复核简历：事实是否经得起面试追问、数值是否有依据。"
        action={
          <Button onClick={onRun} size="sm">
            开始复盘
          </Button>
        }
      />
    );
  }

  const locate = (loc: string) => {
    if (!scrollToAziLoc(loc)) {
      toast('未在预览中找到该位置，请先切换为 Markdown 预览', { variant: 'info' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <StatusPill entry={statusEntry} />
        <span className="text-sm text-muted-foreground">
          {statusEntry.label === '通过' ? '所有事实均可在素材中溯源' : '以下问题建议修改后可再次验证'}
        </span>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <ProgressBar value={result.match_score} max={100} label="JD 关键词覆盖率" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-accent-soft bg-accent-soft/40 p-3">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-accent">
            <CircleCheck className="h-4 w-4" aria-hidden="true" />
            已覆盖 ({result.coverage.hit_keywords.length})
          </h4>
          <p className="text-sm leading-relaxed text-foreground">
            {result.coverage.hit_keywords.join('、') || '—'}
          </p>
        </section>
        <section className="rounded-lg border border-warning-soft bg-warning-soft/40 p-3">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-warning">
            <CircleX className="h-4 w-4" aria-hidden="true" />
            未覆盖 ({result.coverage.missing_keywords.length})
          </h4>
          <p className="text-sm leading-relaxed text-foreground">
            {result.coverage.missing_keywords.join('、') || '—'}
          </p>
        </section>
      </div>

      <section aria-label="事实核查问题">
        <h4 className="mb-2 text-sm font-semibold">
          事实核查 {result.fabrication.passed ? '— 全部通过' : `— ${result.fabrication.issues.length} 处问题`}
        </h4>
        {result.fabrication.issues.length === 0 ? (
          <p className="text-sm text-accent">✓ 未发现无依据的表述</p>
        ) : (
          <ul className="space-y-2">
            {result.fabrication.issues.map((issue, i) => (
              <li key={i} className="rounded-md border border-destructive-soft bg-destructive-soft/40 p-3">
                <div className="text-sm font-medium text-foreground">{issue.claim}</div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">{issue.type}</div>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => locate(issue.location)}>
                  在简历中定位
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}