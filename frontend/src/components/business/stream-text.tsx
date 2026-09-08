/** StreamText（03 §8）：AI 流式渲染 + 思考占位 + 光标 + aria 联锁（03 §2.8/§7.5） */
import { cn } from '../../lib/cn';
import { Skeleton } from '../ui/skeleton';

interface StreamTextProps {
  /** 已流出的文本 */
  text: string;
  /** 流式进行中（附加脉冲光标 + aria-busy） */
  streaming?: boolean;
  /** 思考占位阶段（05 决定 #10：reasoner 不下发思考链，只显示占位，禁 10s+ 干等） */
  thinking?: boolean;
  className?: string;
}

export function StreamText({ text, streaming, thinking, className }: StreamTextProps) {
  if (thinking) {
    return (
      <div aria-busy="true" className={cn('flex items-center gap-3 py-2', className)}>
        <span className="flex gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-2 w-2 rounded-full" />
          ))}
        </span>
        <span className="text-sm text-muted-foreground">正在思考组织内容…</span>
      </div>
    );
  }
  return (
    <div
      aria-busy={streaming || undefined}
      className={cn('whitespace-pre-wrap text-sm leading-relaxed', streaming && 'stream-caret', className)}
    >
      {text}
      {!text && !streaming && <span className="text-muted-foreground">（空）</span>}
    </div>
  );
}