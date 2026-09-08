/** RadioCards（03 §5 P7 场景/模式单选卡）：卡片单选组 */
import { cn } from '../../lib/cn';

export interface RadioCardsOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface RadioCardsProps<T extends string> {
  value: T | null;
  onChange: (value: T) => void;
  options: RadioCardsOption<T>[];
  ariaLabel?: string;
  className?: string;
}

export function RadioCards<T extends string>({ value, onChange, options, ariaLabel, className }: RadioCardsProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-10 rounded-md border px-3 py-2 text-left text-sm transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            <span className="block font-medium">{o.label}</span>
            {o.description && <span className="block text-xs text-muted-foreground">{o.description}</span>}
          </button>
        );
      })}
    </div>
  );
}