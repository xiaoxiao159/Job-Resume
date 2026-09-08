/** StarRating（03 §5 P3.2）：JD 技能星级——用 Star/StarOff 图标渲染，禁 emoji ★ */
import { Star, StarOff } from 'lucide-react';
import { cn } from '../../lib/cn';

export function StarRating({ stars, max = 5, className }: { stars: number; max?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${stars} 星（共 ${max} 星）`}
      className={cn('inline-flex items-center gap-0.5 text-warning', className)}
    >
      {Array.from({ length: max }).map((_, i) =>
        i < stars ? (
          <Star key={i} className="h-3.5 w-3.5 fill-warning" aria-hidden="true" />
        ) : (
          <StarOff key={i} className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
        ),
      )}
    </span>
  );
}