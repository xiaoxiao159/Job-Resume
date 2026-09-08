/**
 * AssistChatDrawer（03 §4.1/§8：右侧多轮协助）：
 * 上下文随对话推进；「停止并回填」把本轮结论落回素材库；ESC/遮罩可关。
 * a11y（03 §7.5）：消息区 role=log aria-live，流式中 aria-busy。
 */
import { Send, Square } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ChatMessage } from '../../api/types';
import { cn } from '../../lib/cn';
import { Drawer } from '../ui/drawer';
import { Button } from '../ui/button';
import { Textarea } from '../ui/input';
import { MDPreview } from './md-preview';

interface AssistChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  messages: ChatMessage[];
  streaming?: boolean;
  thinking?: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  /** 出现「停止并回填」的条件：已有 agent_run_id 且有可回填对话 */
  canRefill?: boolean;
  canCancel?: boolean;
  onStopAndRefill?: () => void | Promise<void>;
  refilling?: boolean;
}

export function AssistChatDrawer({
  open,
  onOpenChange,
  title,
  messages,
  streaming,
  thinking,
  onSend,
  onCancel,
  canRefill,
  canCancel,
  onStopAndRefill,
  refilling,
}: AssistChatDrawerProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      setDraft('');
    }
  }, [open]);

  useEffect(() => {
    if (streaming) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, streaming]);

  const send = () => {
    const text = draft.trim();
    if (!text || streaming) return;
    onSend(text);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={title} description="对话仅用于完善项目素材，不会直接写入简历">
      <div className="flex h-full flex-col">
        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-busy={streaming || undefined}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">提出你的问题，Agent 会有针对性地追问，直到素材足够。</p>
          )}
          {messages.map((m, i) => {
            const isUser = m.role === 'user';
            const lastAssistant = !isUser && i === messages.length - 1;
            return (
              <div key={i} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                    isUser ? 'bg-primary text-white' : 'bg-muted text-foreground',
                    lastAssistant && streaming && 'stream-caret',
                  )}
                >
                  {isUser ? (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  ) : (
                    <MDPreview markdown={m.content} plain />
                  )}
                </div>
              </div>
            );
          })}
          {thinking && (
            <div className="flex justify-start" aria-busy="true">
              <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">正在思考组织内容…</div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <Textarea
            aria-label="对话输入"
            rows={2}
            value={draft}
            disabled={streaming}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
          />
          <div className="mt-2 flex items-center gap-2">
            {canRefill && onStopAndRefill && !streaming && (
              <Button variant="outline" size="sm" loading={refilling} onClick={() => void onStopAndRefill()}>
                停止并回填
              </Button>
            )}
            {canCancel && streaming && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                停止
              </Button>
            )}
            <Button size="sm" className="ml-auto" disabled={streaming || !draft.trim()} onClick={send}>
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              发送
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}