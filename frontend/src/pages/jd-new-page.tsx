/** P3a 新建 JD（03 §5 P3）：粘贴 JD → 保存 → 跳详情自动触发分析 */
import { FileSearch } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createJD } from '../api/jd';
import { PageHeader } from '../components/layout/page-header';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input, Textarea } from '../components/ui/input';
import { useToast } from '../components/ui/toast';

export function JdNewPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', company: '', raw_text: '' });

  const create = useMutation({
    mutationFn: () => createJD(form),
    onSuccess: (jd) => {
      toast('JD 已保存，开始分析', { variant: 'success' });
      navigate(`/jd/${jd.id}?analyze=1`);
    },
    onError: (e) => toast(e instanceof Error ? e.message : '保存失败', { variant: 'error' }),
  });

  return (
    <div>
      <PageHeader title="新建 JD" description="粘贴职位描述，AI 将拆解技能要求并与你的资产做匹配" />
      <div className="max-w-3xl space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="职位名称">
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="如 AI 应用工程师" />
          </Field>
          <Field label="公司">
            <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="如 字节跳动" />
          </Field>
        </div>
        <Field label="职位描述原文" required helper="标题与公司留空时，AI 会从原文中提取">
          <Textarea
            aria-label="职位描述原文"
            rows={14}
            value={form.raw_text}
            onChange={(e) => setForm((f) => ({ ...f, raw_text: e.target.value }))}
            placeholder={'【岗位职责】\n1. …\n【任职要求】\n1. 熟练掌握 Python…'}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate('/jd')}>
            取消
          </Button>
          <Button disabled={!form.raw_text.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            <FileSearch className="size-4" aria-hidden="true" />
            保存并分析
          </Button>
        </div>
      </div>
    </div>
  );
}