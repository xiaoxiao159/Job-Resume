/** Tooltip（Radix——图标按钮的可访问名称补充，03 §2.7/§7.4） */
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  /** 展示内容纯文本帮助；交互元素需另有 aria-label（见使用处） */
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={4}
            className="z-50 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-pop"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-slate-900" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}