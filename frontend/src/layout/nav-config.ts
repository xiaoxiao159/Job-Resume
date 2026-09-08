/** 导航配置（03 §3.1）：两级导航组，同时驱动 Topbar 页面标题 */
import {
  FileSearch,
  FileText,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  MessagesSquare,
  Mic,
  Send,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: '概览',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: '资产准备',
    items: [
      { to: '/assets/basic-info', label: '基本信息', icon: UserRound },
      { to: '/assets/portfolio', label: '技能与经历', icon: GraduationCap },
      { to: '/projects', label: '项目助手', icon: FolderKanban },
    ],
  },
  {
    label: '求职定制',
    items: [
      { to: '/jd', label: 'JD 分析', icon: FileSearch },
      { to: '/resumes', label: '简历', icon: FileText },
      { to: '/hr', label: 'HR 助理', icon: MessagesSquare },
    ],
  },
  {
    label: '投递记录',
    items: [
      { to: '/applications', label: '投递记录', icon: Send },
      { to: '/interviews', label: '面试问答', icon: Mic },
    ],
  },
];

/** 由 pathname 推导页面标题（最长前缀匹配，兜底回品牌名） */
export function pageTitleOf(pathname: string): string {
  let best: NavItem | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const isHome = item.to === '/dashboard';
      const matches =
        pathname === item.to ||
        (isHome && pathname === '/') ||
        (item.to !== '/dashboard' && pathname.startsWith(`${item.to}/`));
      if (matches && (!best || item.to.length > best.to.length)) best = item;
    }
  }
  return best?.label ?? 'AI Job Copilot';
}