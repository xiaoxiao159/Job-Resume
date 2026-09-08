/** GapPanel（03 §5 P3.2）：你的优势 / 你的不足 */
import { ThumbsUp, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';

export function GapPanel({ advantages, gaps }: { advantages: string[]; gaps: string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section className="rounded-lg border border-accent-soft bg-accent-soft/40 p-3">
        <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-accent">
          <ThumbsUp className="h-4 w-4" aria-hidden="true" />
          你的优势
        </h4>
        <ul className="space-y-1 text-sm">
          {advantages.map((a) => (
            <li key={a} className="leading-relaxed">
              {a}
            </li>
          ))}
        </ul>
      </section>
      <section className={cn('rounded-lg border border-warning-soft bg-warning-soft/40 p-3')}>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-warning">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          你的不足
        </h4>
        <ul className="space-y-1 text-sm">
          {gaps.map((g) => (
            <li key={g} className="leading-relaxed">
              {g}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}