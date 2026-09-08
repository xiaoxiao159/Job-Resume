/** P3b JD 列表（03 §5 P3）：最新匹配度一览 */
import { FileSearch, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteJD, jdKeys, listJDs } from '../api/jd';
import { PageHeader } from '../components/layout/page-header';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyState } from '../components/ui/empty-state';
import { SkeletonList } from '../components/ui/skeleton';
import { Table, TBody, Td, THead, Th, Tr } from '../components/ui/table';
import { useToast } from '../components/ui/toast';

export function JdListPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: jdKeys.all, queryFn: () => listJDs() });
  const [toDelete, setToDelete] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => deleteJD(id),
    onSuccess: () => {
      toast('JD 已删除', { variant: 'success' });
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: jdKeys.all });
    },
  });

  if (isLoading) return <SkeletonList rows={4} />;

  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader title="JD 分析" description="拆解岗位要求，量化你与每个机会的距离">
        <Button onClick={() => navigate('/jd/new')}>
          <Plus className="size-4" aria-hidden="true" />
          新建 JD
        </Button>
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title="还没有 JD"
          description="粘贴你心仪岗位的职位描述，AI 帮你拆技能、算匹配"
          action={
            <Button onClick={() => navigate('/jd/new')}>
              <Plus className="size-4" aria-hidden="true" />
              新建 JD
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>职位</Th>
              <Th>公司</Th>
              <Th className="w-32">最新匹配度</Th>
              <Th className="w-44">创建时间</Th>
              <Th className="w-20 text-right">操作</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((jd) => (
              <Tr key={jd.id}>
                <Td>
                  <Link to={`/jd/${jd.id}`} className="font-medium text-primary hover:underline">
                    {jd.title || '（未命名）'}
                  </Link>
                </Td>
                <Td>{jd.company || '—'}</Td>
                <Td>
                  {jd.latest_match_score != null ? (
                    <span
                      className={`font-semibold tabular-nums ${
                        jd.latest_match_score >= 75
                          ? 'text-accent'
                          : jd.latest_match_score >= 50
                            ? 'text-warning'
                            : 'text-destructive'
                      }`}
                    >
                      {jd.latest_match_score}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">未匹配</span>
                  )}
                </Td>
                <Td className="text-sm text-muted-foreground">{new Date(jd.created_at).toLocaleDateString()}</Td>
                <Td className="text-right">
                  <Button
                    aria-label={`删除 ${jd.title}`}
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => setToDelete(jd.id)}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="删除 JD"
        description="将一并删除该 JD 的分析与全部匹配留档。"
        confirmLabel="删除"
        onConfirm={() => {
          if (toDelete) del.mutate(toDelete);
        }}
      />
    </div>
  );
}