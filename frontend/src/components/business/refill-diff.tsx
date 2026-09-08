/**
 * RefillDiff（03 §8 / 05 §4.7）：AI 回填建议对比。
 * 项目七字段并排「当前值 vs AI 建议」，差异字段标「将更新」，确认后整体应用。
 */
import { useState } from 'react';
import type { RefillFields } from '../../api/types';
import { Button } from '../ui/button';
import { Textarea } from '../ui/input';
import { cn } from '../../lib/cn';

const FIELD_META: { key: keyof RefillFields; label: string }[] = [
  { key: 'background', label: '项目背景' },
  { key: 'goal', label: '项目目标' },
  { key: 'responsibilities', label: '你的职责' },
  { key: 'core_work', label: '核心工作' },
  { key: 'difficulties', label: '难点' },
  { key: 'solutions', label: '解决方案' },
  { key: 'results', label: '结果与数据' },
];

interface RefillDiffProps {
  current: RefillFields;
  /** AI 建议（问卷解析任务产物） */
  draft: RefillFields;
  busy?: boolean;
  onApply: (merged: RefillFields) => void | Promise<void>;
  onCancel: () => void;
}

export function RefillDiff({ current, draft, busy, onApply, onCancel }: RefillDiffProps) {
  const [edits, setEdits] = useState<RefillFields>(draft);

  const changed = (k: keyof RefillFields) => (edits[k] ?? '').trim() !== (current[k] ?? '').trim();

  const setField = (k: keyof RefillFields, v: string) => setEdits((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-4">
      {FIELD_META.map(({ key, label }) => (
        <section key={key} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{label}</h4>
            {changed(key) && (
              <span className="rounded bg-warning-soft px-1.5 py-0.5 text-xs text-warning">将更新</span>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">当前素材</p>
              <p className={cn('min-h-10 whitespace-pre-wrap rounded-md border border-border bg-muted/40 px-2.5 py-2 text-sm text-muted-foreground')}>
                {current[key] || '（空）'}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">AI 建议（可修改）</p>
              <Textarea
                aria-label={`${label} AI 建议`}
                rows={2}
                value={edits[key] ?? ''}
                disabled={busy}
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          </div>
        </section>
      ))}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          取消
        </Button>
        <Button loading={busy} onClick={() => void Promise.resolve(onApply(edits))}>
          应用到项目素材
        </Button>
      </div>
    </div>
  );
}