/**
 * AppShell（03 §3.1/§3.2）：左侧两级导航（240px 可折叠 64px）+ 顶栏标题 + 内容区。
 * 折叠态只留图标，Tooltip 提示名称；折叠偏好记 localStorage。
 */
import { BrainCircuit, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '../lib/cn';
import { SkeletonList } from '../components/ui/skeleton';
import { Tooltip } from '../components/ui/tooltip';
import { NAV_GROUPS, pageTitleOf } from './nav-config';

const COLLAPSE_KEY = 'azi-sidebar-collapsed';

export function AppShell() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  return (
    <div className="flex h-screen bg-background">
      <aside
        aria-label="主导航"
        className={cn(
          'flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {/* 品牌 */}
        <div className="flex h-14 items-center gap-2 border-b border-border px-3">
          <BrainCircuit className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          {!collapsed && <span className="truncate font-display text-base font-semibold">AI Job Copilot</span>}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-1.5">
              {collapsed ? (
                <div className="mx-3 mb-1 border-t border-border" />
              ) : (
                <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5 px-2">
                {group.items.map((item) => {
                  const link = (
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isActive
                            ? 'bg-primary-soft text-primary'
                            : 'text-foreground hover:bg-muted',
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  );
                  return (
                    <li key={item.to}>
                      {collapsed ? (
                        <Tooltip content={item.label} side="right">
                          {link}
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
          <button
            type="button"
            aria-label={collapsed ? '展开导航' : '折叠导航'}
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
          </button>
          <h1 className="truncate font-display text-base font-semibold">{pageTitleOf(pathname)}</h1>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
            {/* 懒加载页面的 Suspense 边界：首次导航分包未就绪时先展示骨架屏 */}
            <Suspense fallback={<SkeletonList rows={4} />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}