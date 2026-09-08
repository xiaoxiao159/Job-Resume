/**
 * 枚举 → 中文 label → Lucide 图标 → 语义色的单一来源映射。
 * 依据：02-data-model §5 枚举值、03-ui-ux-design §2.3 状态与语义色表。
 * 规范（03 §2.3/§7）：状态一律 icon + 色 + 文字三重编码，不允许纯色块。
 */
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock,
  FileText,
  GraduationCap,
  type LucideIcon,
  Loader2,
  MessageCircle,
  MessageCircleOff,
  Send,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AgentRunStatus,
  AnalysisStatus,
  ApplicationStatus,
  Availability,
  Degree,
  EvidenceType,
  ExperienceType,
  ExpressionStatus,
  ExpressionType,
  HrMode,
  HrScene,
  Proficiency,
  ReflectionStatus,
  ResumeTemplate,
  SkillMatchStatus,
} from '../api/types';

export interface EnumEntry<E extends string> {
  value: E;
  label: string;
  /** 无图标语义时省略（纯表单选项） */
  icon?: LucideIcon;
  /** 出现在状态 pill 上时的背景，icon 单独染色见 iconClass */
  className?: string;
  iconClass?: string;
}

export function entryLabel<E extends string>(entries: EnumEntry<E>[], value?: E | null): string {
  return entries.find((e) => e.value === value)?.label ?? (value ?? '');
}

// ── 投递七态（03 §2.3）────────────────────────────────────────────
export const APPLICATION_STATUS_ENTRIES: EnumEntry<ApplicationStatus>[] = [
  { value: 'to_apply', label: '待投递', icon: CircleDashed, className: 'bg-slate-100 text-slate-600', iconClass: 'text-slate-500' },
  { value: 'applied', label: '已投递', icon: Send, className: 'bg-primary-soft text-primary', iconClass: 'text-primary' },
  { value: 'replied', label: '已回复', icon: MessageCircle, className: 'bg-cyan-50 text-cyan-700', iconClass: 'text-cyan-600' },
  { value: 'interview', label: '面试', icon: Users, className: 'bg-violet-50 text-violet-700', iconClass: 'text-violet-600' },
  { value: 'offer', label: 'Offer', icon: BadgeCheck, className: 'bg-accent-soft text-accent', iconClass: 'text-accent' },
  { value: 'rejected', label: '拒绝', icon: XCircle, className: 'bg-destructive-soft text-destructive', iconClass: 'text-destructive' },
  { value: 'no_response', label: '无回复', icon: MessageCircleOff, className: 'bg-slate-50 text-slate-400', iconClass: 'text-slate-400' },
];

// ── 匹配三态（03 §2.3）────────────────────────────────────────────
export const SKILL_MATCH_ENTRIES: EnumEntry<SkillMatchStatus>[] = [
  { value: 'strong', label: '强匹配', icon: Check, className: 'bg-accent-soft text-accent', iconClass: 'text-accent' },
  { value: 'partial', label: '部分匹配', icon: TriangleAlert, className: 'bg-warning-soft text-warning', iconClass: 'text-warning' },
  { value: 'missing', label: '缺失', icon: X, className: 'bg-destructive-soft text-destructive', iconClass: 'text-destructive' },
];

// ── 表达状态 ──────────────────────────────────────────────────────
export const EXPRESSION_STATUS_ENTRIES: EnumEntry<ExpressionStatus>[] = [
  { value: 'draft', label: '草稿', icon: FileText, className: 'bg-slate-100 text-slate-600', iconClass: 'text-slate-500' },
  { value: 'confirmed', label: '已确认', icon: CheckCircle2, className: 'bg-accent-soft text-accent', iconClass: 'text-accent' },
];

// ── Reflection 状态 ───────────────────────────────────────────────
export const REFLECTION_STATUS_ENTRIES: EnumEntry<ReflectionStatus>[] = [
  { value: 'pending', label: '未验证', icon: Clock, className: 'bg-warning-soft text-warning', iconClass: 'text-warning' },
  { value: 'passed', label: '通过', icon: ShieldCheck, className: 'bg-accent-soft text-accent', iconClass: 'text-accent' },
  { value: 'issues', label: '存在问题', icon: ShieldAlert, className: 'bg-destructive-soft text-destructive', iconClass: 'text-destructive' },
];

// ── 分析 / 任务状态（processing 用 Loader 旋转是唯一不以 pill 呈现的）──
export const ANALYSIS_STATUS_ENTRIES: EnumEntry<AnalysisStatus>[] = [
  { value: 'processing', label: '分析中', icon: Loader2, className: 'bg-primary-soft text-primary', iconClass: 'animate-spin text-primary' },
  { value: 'completed', label: '已完成', icon: CheckCircle2, className: 'bg-accent-soft text-accent', iconClass: 'text-accent' },
  { value: 'failed', label: '失败', icon: XCircle, className: 'bg-destructive-soft text-destructive', iconClass: 'text-destructive' },
];

export const AGENT_RUN_STATUS_ENTRIES: EnumEntry<AgentRunStatus>[] = [
  { value: 'running', label: '运行中', icon: Loader2, className: 'bg-primary-soft text-primary', iconClass: 'animate-spin text-primary' },
  { value: 'completed', label: '已完成', icon: CheckCircle2, className: 'bg-accent-soft text-accent', iconClass: 'text-accent' },
  { value: 'failed', label: '失败', icon: XCircle, className: 'bg-destructive-soft text-destructive', iconClass: 'text-destructive' },
];

// ── 纯表单选项（无 pill 语义）─────────────────────────────────────
export const AVAILABILITY_ENTRIES: EnumEntry<Availability>[] = [
  { value: 'immediate', label: '立即到岗' },
  { value: 'within_1_week', label: '一周内到岗' },
  { value: 'within_2_weeks', label: '两周内到岗' },
  { value: 'within_1_month', label: '一个月内到岗' },
  { value: 'undecided', label: '待定' },
];

export const DEGREE_ENTRIES: EnumEntry<Degree>[] = [
  { value: 'bachelor', label: '本科' },
  { value: 'master', label: '硕士' },
  { value: 'phd', label: '博士' },
];

export const EXPERIENCE_TYPE_ENTRIES: EnumEntry<ExperienceType>[] = [
  { value: 'research', label: '科研经历' },
  { value: 'campus', label: '校园经历' },
];

export const PROFICIENCY_ENTRIES: EnumEntry<Proficiency>[] = [
  { value: 'beginner', label: '了解' },
  { value: 'familiar', label: '熟悉' },
  { value: 'proficient', label: '熟练' },
  { value: 'expert', label: '精通' },
];

export const EVIDENCE_TYPE_ENTRIES: EnumEntry<EvidenceType>[] = [
  { value: 'github', label: 'GitHub 仓库' },
  { value: 'code', label: '代码片段' },
  { value: 'doc', label: '项目文档' },
  { value: 'experiment', label: '实验结果' },
  { value: 'screenshot', label: '项目截图' },
  { value: 'demo', label: 'Demo' },
  { value: 'paper', label: '论文' },
  { value: 'other', label: '其他' },
];

export const EXPRESSION_TYPE_ENTRIES: EnumEntry<ExpressionType>[] = [
  { value: 'resume_bullet', label: '简历版' },
  { value: 'interview', label: '面试版' },
  { value: 'star', label: 'STAR 版' },
];

export const RESUME_TEMPLATE_ENTRIES: EnumEntry<ResumeTemplate>[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'modern', label: 'Modern' },
  { value: 'minimal', label: 'Minimal' },
];

export const HR_SCENE_ENTRIES: EnumEntry<HrScene>[] = [
  { value: 'boss_zhipin', label: 'Boss直聘' },
  { value: 'wechat', label: '微信' },
  { value: 'email', label: '邮件' },
  { value: 'linkedin', label: 'LinkedIn' },
];

export const HR_MODE_ENTRIES: EnumEntry<HrMode>[] = [
  { value: 'short', label: '简短版' },
  { value: 'standard', label: '标准版' },
  { value: 'technical', label: '技术版' },
];

export const DEGREE_ICON: LucideIcon = GraduationCap;