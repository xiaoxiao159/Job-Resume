/** ConfirmDialog（03 §4.6：删除/覆盖等破坏性确认——红按钮 + 说明后果） */
import { useState, type ReactNode } from 'react';
import { Modal } from './modal';
import { Button } from './button';
import { TriangleAlert } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  /** 非破坏性确认（如定稿）时用 primary，破坏性默认红 */
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '确认',
  danger = true,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant={danger ? 'destructive' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-2.5 text-sm">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="leading-relaxed">{description}</div>
      </div>
    </Modal>
  );
}