/** Field（03 §4.4 表单规范组件化）：可见 label · 必填 * · helper · 就地错误 */
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  helper?: ReactNode;
  /** 就地错误（03 §4.4：不用顶部汇总替代） */
  error?: string | null;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, required, helper, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {helper && !error && <p className="text-xs text-muted-foreground">{helper}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}