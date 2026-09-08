/** P1 Dashboard（03 §5 P1 / 04 §5.1）：投递漏斗 + 资产准备度 + 最近投递 */
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  MessageCircle,
  Percent,
  Send,
  Users,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardKeys, getDashboard } from '../api/dashboard';
import { APPLICATION_STATUS_ENTRIES } from '../lib/enums';
import { PageHeader } from '../components/layout/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/card';
import { StatusPill } from '../components/ui/badge';
import { SkeletonList } from '../components/ui/skeleton';
import { EmptyState } from '../components/ui/empty-state';

const STATS = [
  { key: 'applied', label: '已投递', icon: Send, className: 'text-primary' },
  { key: 'replied', label: '已回复', icon: MessageCircle, className: 'text-cyan-600' },
  { key: 'interview', label: '面试', icon: Users, className: 'text-violet-600' },
  { key: 'offer', label: 'Offer', icon: BadgeCheck, className: 'text-accent' },
] as const;

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: dashboardKeys.all, queryFn: getDashboard });

  if (isLoading) return <SkeletonList rows={6} />;
  if (!data) return <EmptyState icon={Circle} title="暂无数据" />;

  const ast = data.asset_progress;

  return (
    <div>
      <PageHeader title="Dashboard" description="求职全局一览：投递漏斗与资产准备度" />

      {/* 投递漏斗 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {STATS.map(({ key, label, icon: Icon, className }) => (
          <Card key={key}>
            <CardBody className="flex items-center gap-3 py-4">
              <span className="rounded-md bg-primary-soft p-2">
                <Icon className={`size-5 ${className}`} aria-hidden="true" />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{data.stats[key]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardBody>
          </Card>
        ))}
        <Card>
          <CardBody className="flex items-center gap-3 py-4">
            <span className="rounded-md bg-accent-soft p-2">
              <Percent className="size-5 text-accent" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{data.stats.reply_rate}%</p>
              <p className="text-xs text-muted-foreground">回复率</p>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* 资产准备度 */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>资产准备度</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2.5">
            <AssetRow done={ast.basic_info} label="基本信息" />
            <AssetRow done={(ast.projects_count ?? 0) > 0} label={`项目经历（${ast.projects_count}）`} />
            <AssetRow done={(ast.skills_count ?? 0) > 0} label={`专业技能（${ast.skills_count}）`} />
            <AssetRow done={(ast.education_count ?? 0) > 0} label={`教育经历（${ast.education_count}）`} />
            <p className="pt-1 text-xs text-muted-foreground">
              准备完成后，即可生成高质量的定制简历
            </p>
          </CardBody>
        </Card>

        {/* 最近投递 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>最近投递</CardTitle>
            <Link to="/applications" className="text-sm text-primary hover:underline">
              全部
            </Link>
          </CardHeader>
          <CardBody>
            {data.recent_applications.length === 0 ? (
              <EmptyState icon={Send} title="还没有投递记录" description="从 JD 分析或简历页发起第一份投递吧" />
            ) : (
              <ul className="divide-y divide-border">
                {data.recent_applications.map((app) => {
                  const entry = APPLICATION_STATUS_ENTRIES.find((e) => e.value === app.status);
                  return (
                    <li key={app.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {app.position}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">{app.company}</span>
                        </p>
                        {app.resume_version && (
                          <p className="truncate text-xs text-muted-foreground">
                            {app.resume_version.resume_title} · v{app.resume_version.version_number}
                          </p>
                        )}
                      </div>
                      {entry && <StatusPill entry={entry} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function AssetRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="size-4 text-accent" aria-hidden="true" />
      ) : (
        <Circle className="size-4 text-muted" aria-hidden="true" />
      )}
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
      {!done && <span className="ml-auto text-xs text-warning">待补充</span>}
    </div>
  );
}