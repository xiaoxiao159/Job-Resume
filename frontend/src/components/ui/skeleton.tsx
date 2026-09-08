/** Skeleton（03 §4.2：>1s 列表/查询用骨架屏 + aria-busy，禁闪烁 spinner） */
import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-muted', className)} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="加载中" className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}