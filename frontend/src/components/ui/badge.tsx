/** Badge + StatusPill（03 §2.3/§4.3：状态一律 icon + 色 + 文字三重编码） */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { EnumEntry } from '../../lib/enums';

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600',
    primary: 'bg-primary-soft text-primary',
    success: 'bg-accent-soft text-accent',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-destructive-soft text-destructive',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

interface StatusPillProps<E extends string> {
  entry: EnumEntry<E>;
  /** 纯展示不可点（03 §4.3） */
  interactive?: boolean;
  className?: string;
  iconScale?: number;
}

export function StatusPill<E extends string>({ entry, interactive, className, iconScale }: StatusPillProps<E>) {
  const Icon: LucideIcon | undefined = entry.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        entry.className,
        interactive && 'transition-colors duration-150 hover:opacity-85',
        className,
      )}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          className={cn(entry.iconClass, 'shrink-0')}
          style={{ width: 14 * (iconScale ?? 1), height: 14 * (iconScale ?? 1) }}
        />
      )}
      {entry.label}
    </span>
  );
}

/** 「AI 草稿」角标（03 §4.1：amber）与「已确认」角标（green） */
export function AiDraftBadge({ confirmed }: { confirmed: boolean }) {
  return confirmed ? (
    <Badge tone="success">
      <span aria-hidden="true">✓</span> 已确认
    </Badge>
  ) : (
    <Badge tone="warning">AI 草稿</Badge>
  );
}