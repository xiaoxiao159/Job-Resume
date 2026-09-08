/** Select（Radix primitives 复杂交互，03 §9 决定 #1）——统一 option 结构 */
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  value: string | undefined;
  onChange: (value: string) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  /** 行内模式（表格内状态下拉）：更紧凑 */
  inline?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled,
  inline,
  className,
  ariaLabel,
}: SelectProps<T>) {
  return (
    <RadixSelect.Root value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center justify-between gap-2 rounded-md border border-border bg-card text-sm transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary disabled:opacity-60',
          inline ? 'h-8 px-2 text-xs' : 'h-10 px-3 w-full',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-card shadow-pop"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className={cn(
                  'relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-8 text-sm outline-none',
                  'data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary data-[disabled]:opacity-50',
                )}
              >
                <RadixSelect.ItemIndicator className="absolute left-2">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}