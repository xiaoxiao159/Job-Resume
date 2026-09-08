/** MatchList（03 §5 P3.2）：匹配三态分组清单（强匹配/部分匹配/缺失），缺多项折叠 */
import { useState } from 'react';
import { SKILL_MATCH_ENTRIES } from '../../lib/enums';
import { StatusPill } from '../ui/badge';
import type { SkillMatchStatus } from '../../api/types';
import { cn } from '../../lib/cn';

interface MatchListProps {
  matches: { name: string; status: SkillMatchStatus }[];
  /** 元素级昵称（技能/关键词） */
  itemLabel?: string;
}

export function MatchList({ matches, itemLabel = '项' }: MatchListProps) {
  const [expandMissing, setExpandMissing] = useState(false);
  const groups: SkillMatchStatus[] = ['strong', 'partial', 'missing'];
  const grouped = (s: SkillMatchStatus) => matches.filter((m) => m.status === s);

  return (
    <div className="space-y-3">
      {groups.map((s) => {
        const entry = SKILL_MATCH_ENTRIES.find((e) => e.value === s)!;
        const rows = grouped(s);
        const isMissing = s === 'missing';
        const collapsed = isMissing && !expandMissing && rows.length > 3;
        const visible = collapsed ? rows.slice(0, 3) : rows;
        return (
          <div key={s}>
            <div className="mb-1.5 flex items-center gap-2">
              <StatusPill entry={entry} />
              <span className="text-xs text-muted-foreground">
                {rows.length} {itemLabel}
              </span>
            </div>
            <ul className="space-y-1">
              {visible.map((m) => (
                <li
                  key={`${s}-${m.name}`}
                  className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground" aria-hidden="true">
                    {m.name}
                  </span>
                </li>
              ))}
              {rows.length === 0 && (
                <li className="px-1 text-xs text-muted-foreground">无</li>
              )}
            </ul>
            {collapsed && (
              <button
                type="button"
                onClick={() => setExpandMissing(true)}
                className={cn('mt-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
              >
                展开全部 {rows.length - 3} 项
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}