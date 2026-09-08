/** Dropdown（Radix 菜单：行操作 "⋯" 等） */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** 破坏性条目（删除等，红色，03 §4.6） */
  danger?: boolean;
  disabled?: boolean;
}

interface DropdownProps {
  trigger: ReactNode;
  items: MenuItem[];
  ariaLabel?: string;
}

export function Dropdown({ trigger, items, ariaLabel }: DropdownProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          aria-label={ariaLabel}
          sideOffset={4}
          align="end"
          className="z-50 min-w-32 rounded-md border border-border bg-card p-1 shadow-pop"
        >
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <DropdownMenu.Item
                key={it.label}
                disabled={it.disabled}
                onSelect={(e) => {
                  e.preventDefault();
                  it.onSelect();
                }}
                className={cn(
                  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm outline-none',
                  'data-[highlighted]:bg-muted data-[disabled]:opacity-50',
                  it.danger ? 'text-destructive data-[highlighted]:bg-destructive-soft' : 'text-foreground',
                )}
              >
                {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                {it.label}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}