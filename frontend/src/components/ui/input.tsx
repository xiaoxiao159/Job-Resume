/** Input / Textarea（03 §8 基础清单；可见 label 由 Field 承担，占位符仅作示例） */
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const base =
  'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground placeholder:opacity-70 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary disabled:bg-muted disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(base, 'h-10', invalid && 'border-destructive focus:ring-destructive', className)}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(base, 'min-h-24 leading-relaxed', invalid && 'border-destructive focus:ring-destructive', className)}
        {...rest}
      />
    );
  },
);