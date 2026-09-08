/** P5b HR 消息详情（03 §5 P5）：查看 / 复制 / 编辑 / 删除，习惯发句进投递 */
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteHRMessage, getHRMessage, hrKeys, patchHRMessage } from '../api/hr-messages';
import { copyText } from '../lib/download';
import { HR_MODE_ENTRIES, HR_SCENE_ENTRIES } from '../lib/enums';
import { PageHeader } from '../components/layout/page-header';
import { MDPreview } from '../components/business/md-preview';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { SkeletonList } from '../components/ui/skeleton';
import { Textarea } from '../components/ui/input';
import { useToast } from '../components/ui/toast';

export function HrDetailPage() {
  const { hrId = '' } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: message, isLoading } = useQuery({ queryKey: hrKeys.detail(hrId), queryFn: () => getHRMessage(hrId) });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (message) setDraft(message.content);
  }, [message?.id]);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const patch = useMutation({
    mutationFn: () => patchHRMessage(hrId, { content: draft }),
    onSuccess: () => {
      toast('已保存', { variant: 'success' });
      setEditing(false);
      void qc.invalidateQueries({ queryKey: hrKeys.detail(hrId) });
      void qc.invalidateQueries({ queryKey: hrKeys.all });
    },
    onError: (e) => toast(e instanceof Error ? e.message : '保存失败', { variant: 'error' }),
  });

  const del = useMutation({
    mutationFn: () => deleteHRMessage(hrId),
    onSuccess: () => {
      toast('已删除', { variant: 'success' });
      void qc.invalidateQueries({ queryKey: hrKeys.all });
      navigate('/hr');
    },
  });

  if (isLoading || !message) return <SkeletonList rows={5} />;

  return (
    <div>
      <PageHeader
        title="消息详情"
        description={`${HR_SCENE_ENTRIES.find((e) => e.value === message.scene)?.label} · ${HR_MODE_ENTRIES.find((e) => e.value === message.mode)?.label} · ${new Date(message.created_at).toLocaleString()}`}
      >
        <Button
          variant="outline"
          onClick={async () => {
            const ok = await copyText(message.content);
            toast(ok ? '已复制' : '复制失败', { variant: ok ? 'success' : 'error' });
          }}
        >
          <Copy className="size-4" aria-hidden="true" />
          复制
        </Button>
        <Button variant="outline" onClick={() => setEditing(true)} disabled={editing}>
          <Pencil className="size-4" aria-hidden="true" />
          编辑
        </Button>
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4" aria-hidden="true" />
          删除
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>内容</CardTitle>
        </CardHeader>
        <CardBody>
          {editing ? (
            <div className="space-y-3">
              <Textarea aria-label="消息内容" rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  取消
                </Button>
                <Button loading={patch.isPending} onClick={() => patch.mutate()}>
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <MDPreview markdown={message.content} plain ariaLabel="消息内容" />
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除消息"
        description="删除后不可恢复。"
        confirmLabel="删除"
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}