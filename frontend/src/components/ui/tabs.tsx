/** Tabs（Radix primitives 复杂交互，03 §9 决定 #1）；深链接同步由页面用 query 参数承担 */
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '../../lib/cn';

export interface TabItem {
  value: string;
  label: string;
  badge?: number;
}

interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  items: TabItem[];
  ariaLabel?: string;
  className?: string;
}

export function Tabs({ value, onChange, items, ariaLabel, className }: TabsProps) {
  return (
    <RadixTabs.Root value={value} onValueChange={onChange} className={className}>
      <RadixTabs.List
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1 border-b border-border"
      >
        {items.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              '-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'data-[state=active]:border-primary data-[state=active]:text-primary data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground',
            )}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{t.badge}</span>
            )}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </RadixTabs.Root>
  );
}

export { RadixTabs };