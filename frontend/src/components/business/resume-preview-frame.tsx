/** ResumePreviewFrame（03 §5 P6.4）：sandbox iframe 渲染后端 HTML 预览 */
import { cn } from '../../lib/cn';

interface ResumePreviewFrameProps {
  html: string;
  title?: string;
  className?: string;
}

export function ResumePreviewFrame({ html, title = '简历预览', className }: ResumePreviewFrameProps) {
  return (
    <iframe
      title={title}
      sandbox=""
      srcDoc={html}
      className={cn('h-full w-full rounded-md border border-border bg-card', className)}
    />
  );
}