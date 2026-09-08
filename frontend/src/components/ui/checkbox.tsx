/** Checkbox（自封装——结构简单不上 Radix，03 §9 决定 #1） */
import { cn } from '../../lib/cn';
import { Check } from 'lucide-react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

export function Checkbox({ checked, onChange, label, disabled, id }: CheckboxProps) {
  const box = (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!disabled) onChange(!checked);
        }
      }}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded border transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'border-primary bg-primary text-white' : 'border-border bg-card',
        disabled && 'opacity-50',
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
    </span>
  );
  if (!label) return box;
  return (
    <label htmlFor={id} className={cn('inline-flex items-center gap-2 text-sm', disabled && 'opacity-60')}>
      {box}
      <span>{label}</span>
    </label>
  );
}