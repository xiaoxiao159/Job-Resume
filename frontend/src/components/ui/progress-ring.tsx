/** ProgressRing（03 §5 P3.2 匹配度圆环：大数字 + 环形进度；
 *  颜色语义 ≥75 green / 50–75 amber / <50 red，且始终显示数字本身——不只用颜色） */
interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  /** 显示在主数字旁的附加标签（如「总体匹配」） */
  label?: string;
}

function toneOf(v: number): string {
  if (v >= 75) return '#16A34A';
  if (v >= 50) return '#D97706';
  return '#DC2626';
}

export function ProgressRing({ value, size = 96, strokeWidth = 8, label }: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const color = toneOf(pct);
  return (
    <div className="inline-flex flex-col items-center gap-1" role="img" aria-label={`匹配度 ${value}%`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-display text-2xl font-semibold"
          style={{ color }}
        >
          {value}
          <span className="text-sm" aria-hidden="true">%</span>
        </span>
      </div>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}

/** 横向进度条（03 §5 P5.2 Reflection 匹配度 78/100） */
export function ProgressBar({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = toneOf(pctToTone(value, max));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-muted-foreground">
        {value} / {max}
      </span>
    </div>
  );
}

function pctToTone(value: number, max: number): number {
  return (value / max) * 100;
}