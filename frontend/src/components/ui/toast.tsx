/** Toast（03 §8 基础清单 / §4.4 提交反馈链：点击 → loading → 成功 Toast / 失败就地错误） */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (title: string, opts?: { description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToast 必须在 <ToastProvider> 内使用');
  return v;
}

const ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};
const TONES: Record<ToastVariant, string> = {
  success: 'text-accent',
  error: 'text-destructive',
  info: 'text-primary',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const counters = useRef(new Map<string, number>());

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (title: string, opts?: { description?: string; variant?: ToastVariant }) => {
      // 高频防抖：同标题 1.5s 内只合并计数（如连续复制）
      const key = title;
      const last = counters.current.get(key) ?? 0;
      const now = Date.now();
      if (now - last < 1500) {
        counters.current.set(key, now);
        return;
      }
      counters.current.set(key, now);
      const id = ++seq.current;
      setItems((xs) => [...xs, { id, title, description: opts?.description, variant: opts?.variant ?? 'success' }]);
      setTimeout(() => remove(id), 3200);
    },
    [remove],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-80 flex-col gap-2">
        {items.map((t) => {
          const Icon = ICONS[t.variant];
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex items-start gap-2 rounded-lg border border-border bg-card p-3 shadow-pop">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONES[t.variant])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}