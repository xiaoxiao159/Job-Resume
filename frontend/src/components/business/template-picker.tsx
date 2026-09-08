/** TemplatePicker（03 §5 P6.4 / §2.5 三模板）：简历模板可视选择 */
import type { CSSProperties } from 'react';
import type { ResumeTemplate } from '../../api/types';
import { RESUME_TEMPLATE_ENTRIES } from '../../lib/enums';
import { cn } from '../../lib/cn';

const TEMPLATE_PREVIEW: Record<ResumeTemplate, CSSProperties> = {
  classic: { fontFamily: 'Georgia, "Songti SC", serif', color: '#1e293b' },
  modern: { fontFamily: 'Poppins, sans-serif', color: '#0f172a' },
  minimal: { fontFamily: '"Open Sans", sans-serif', color: '#334155' },
};

interface TemplatePickerProps {
  value: ResumeTemplate | null;
  onChange: (t: ResumeTemplate) => void;
  disabled?: boolean;
}

export function TemplatePicker({ value, onChange, disabled }: TemplatePickerProps) {
  return (
    <div role="radiogroup" aria-label="简历模板" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {RESUME_TEMPLATE_ENTRIES.map((entry) => {
        const active = value === entry.value;
        return (
          <button
            key={entry.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(entry.value)}
            className={cn(
              'group rounded-lg border-2 bg-card p-3 text-left transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'border-primary' : 'border-border hover:border-muted-foreground/50',
              disabled && 'opacity-60',
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className={cn('text-sm font-semibold', active && 'text-primary')}>{entry.label}</span>
              <span
                aria-hidden="true"
                className={cn(
                  'inline-block h-3 w-3 rounded-full border-2',
                  active ? 'border-primary bg-primary' : 'border-muted-foreground',
                )}
              />
            </div>
            {/* 风格缩略示意 */}
            <div
              aria-hidden="true"
              className="space-y-1.5 rounded border border-border bg-card p-2.5"
              style={TEMPLATE_PREVIEW[entry.value]}
            >
              {entry.value === 'modern' && <div className="mb-1.5 h-1 w-1/2 rounded bg-primary" />}
              <div className="h-1.5 w-2/3 rounded bg-slate-300 text-[8px] font-bold leading-none">张三</div>
              <div className="h-1 w-1/3 rounded bg-slate-200" />
              <div className="h-1 w-3/4 rounded bg-slate-200" />
              <div className="h-1 w-3/5 rounded bg-slate-200" />
              <div className={cn('h-1 w-1/2 rounded', entry.value === 'minimal' ? 'bg-primary/70' : 'bg-slate-300')} />
              <div className="h-1 w-3/4 rounded bg-slate-200" />
            </div>
          </button>
        );
      })}
    </div>
  );
}