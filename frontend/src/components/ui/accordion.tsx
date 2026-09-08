/** Accordion（自封装：grid-template-rows 高度动画，03 §2.8 禁直接动画 height） */
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface AccordionItemProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** 组头右侧补充内容（状态 pill 等） */
  extra?: ReactNode;
}

export function AccordionItem({ title, children, defaultOpen = false, extra }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:rounded-lg"
      >
        <span className="flex min-w-0 items-center gap-2">{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {extra}
          <ChevronDown
            aria-hidden="true"
            className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-4 py-3">{children}</div>
        </div>
      </div>
    </div>
  );
}