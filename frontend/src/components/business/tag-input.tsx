/** TagInput（03 §8）：标签输入。回车/逗号建签、退格删除末签、suggestions 快捷补充 */
import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  suggestions?: string[];
  ariaLabel?: string;
  className?: string;
}

export function TagInput({ value, onChange, placeholder, disabled, suggestions, ariaLabel, className }: TagInputProps) {
  const [text, setText] = useState('');

  const add = (raw: string) => {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
  };

  const commit = () => {
    add(text);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !text && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  const remaining = (suggestions ?? []).filter((s) => !value.includes(s));

  return (
    <div
      className={cn(
        'flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-sm transition-colors duration-150',
        'focus-within:border-primary focus-within:ring-2 focus-within:ring-ring',
        disabled && 'opacity-60',
        className,
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded bg-primary-soft px-2 py-0.5 text-xs text-primary">
          {tag}
          <button
            type="button"
            aria-label={`删除 ${tag}`}
            disabled={disabled}
            onClick={() => remove(tag)}
            className="rounded-sm hover:text-primary/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        aria-label={ariaLabel}
        value={text}
        disabled={disabled}
        placeholder={value.length === 0 ? placeholder : ''}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        className="min-w-24 flex-1 border-none bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
      />
      {remaining.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          {remaining.slice(0, 4).map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => add(s)}
              className="rounded border border-dashed border-muted-foreground/50 px-1.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              + {s}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}