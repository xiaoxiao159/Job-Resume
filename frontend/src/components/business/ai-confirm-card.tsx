/**
 * AIConfirmCard（03 §8 / §4.1 核心交互）：
 * AI 生成结果卡 + 「确认 / 编辑 / 重新生成」三动作 + AI 草稿角标 + 👍/👎 反馈。
 * Human-in-the-loop 落点：所有生成内容经此组件进入用户手。
 */
import { Copy, Pencil, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { copyText } from '../../lib/download';
import { sendAgentRunFeedback } from '../../api/agent-runs';
import { useToast } from '../ui/toast';
import { AiDraftBadge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardBody, CardHeader } from '../ui/card';
import { Textarea } from '../ui/input';
import { cn } from '../../lib/cn';
import { StreamText } from './stream-text';

interface AIConfirmCardProps {
  text: string;
  streaming?: boolean;
  thinking?: boolean;
  /** 已确认内容（确认后角标变绿） */
  confirmed?: boolean;
  /** 生成的 agent_run_id（👍/👎 落库用） */
  agentRunId?: string | null;
  onConfirm: () => void | Promise<void>;
  /** 编辑：进入内联编辑态（编辑后保存） */
  onSaveEdit: (value: string) => void | Promise<void>;
  /** 重新生成：二次确认覆盖？(03 §4.1) 由页面先行 ConfirmDialog，这里直接触发 */
  onRegenerate: () => void | Promise<void>;
  /** 确认/编辑/重新生成渲染开关 */
  actions?: ('confirm' | 'edit' | 'regenerate')[];
  copyLabel?: string;
  className?: string;
  /** 自定义附加说明（如「仅改写表达，未新增事实」） */
  footnote?: ReactNode;
}

export function AIConfirmCard({
  text,
  streaming,
  thinking,
  confirmed,
  agentRunId,
  onConfirm,
  onSaveEdit,
  onRegenerate,
  actions = ['confirm', 'edit', 'regenerate'],
  copyLabel = '复制',
  className,
  footnote,
}: AIConfirmCardProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [busy, setBusy] = useState<string | null>(null);
  const feedbackRef = useRef(agentRunId);
  feedbackRef.current = agentRunId;

  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  useEffect(() => {
    if (!streaming && !thinking) setDraft(text);
  }, [streaming, thinking, text]);

  const act = async (key: string, fn: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const feedback = async (v: 'up' | 'down') => {
    if (!feedbackRef.current) return;
    try {
      await sendAgentRunFeedback(feedbackRef.current, v);
      toast(v === 'up' ? '已记录「有帮助」' : '已记录「需改进」');
    } catch {
      toast('反馈功能将在后端升版后可用', { variant: 'info' });
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <AiDraftBadge confirmed={!!confirmed} />
        <div className="flex items-center gap-1">
          {agentRunId && !confirmed && (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-label="回答有帮助"
                onClick={() => void feedback('up')}
                className="h-8 w-8 p-0"
              >
                <ThumbsUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="回答需要改进"
                onClick={() => void feedback('down')}
                className="h-8 w-8 p-0"
              >
                <ThumbsDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const ok = await copyText(text);
              toast(ok ? '已复制' : '复制失败，请手动复制', { variant: ok ? 'success' : 'error' });
            }}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {copyLabel}
          </Button>
        </div>
      </CardHeader>
      <CardBody className="min-h-16">
        {editing ? (
          <Textarea
            aria-label="编辑生成内容"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-28"
          />
        ) : (
          <StreamText text={text} streaming={streaming} thinking={thinking} />
        )}
        {footnote && <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>}
      </CardBody>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
        {editing ? (
          <>
            <Button size="sm" loading={busy === 'save'} onClick={() => void act('save', () => Promise.resolve(onSaveEdit(draft)).then(() => setEditing(false)))}>
              保存编辑
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              取消
            </Button>
          </>
        ) : (
          <>
            {actions.includes('confirm') && (
              <Button size="sm" loading={busy === 'confirm'} disabled={streaming || thinking} onClick={() => void act('confirm', onConfirm)}>
                确认
              </Button>
            )}
            {actions.includes('edit') && (
              <Button size="sm" variant="outline" disabled={streaming || thinking} onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                编辑
              </Button>
            )}
            {actions.includes('regenerate') && (
              <Button size="sm" variant="ghost" disabled={streaming || thinking} onClick={() => void act('regenerate', onRegenerate)}>
                重新生成
              </Button>
            )}
          </>
        )}
        {streaming && <span className={cn('ml-auto text-xs text-muted-foreground')}>生成中，完成后可确认</span>}
      </div>
    </Card>
  );
}