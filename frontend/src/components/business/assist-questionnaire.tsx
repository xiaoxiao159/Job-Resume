/** AssistQuestionnaire（05 §4.6 问卷式引导）：项目素材补全问卷（第 1 轮四问） */
import { useEffect, useState } from 'react';
import { Field } from '../ui/field';
import { Textarea } from '../ui/input';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';

interface AssistQuestionnaireProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 自定义标题（默认「项目补充问卷」） */
  title?: string;
  questions: string[];
  /** 提交中（等待 Agent 问卷解析任务） */
  busy?: boolean;
  onSubmit: (answers: string[]) => void | Promise<void>;
}

export function AssistQuestionnaire({
  open,
  onOpenChange,
  title = '项目补充问卷',
  questions,
  busy,
  onSubmit,
}: AssistQuestionnaireProps) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));

  useEffect(() => {
    setAnswers(questions.map(() => ''));
  }, [questions, open]);

  const filled = answers.filter((a) => a.trim()).length;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title}
      description={`第 1 轮（${filled}/${questions.length} 已填）——你的回答会在后台修正错别字与语气后回填到项目素材库`}
      size="lg"
    >
      <form className="space-y-4">
        {questions.map((q, i) => (
          <Field key={i} label={`${i + 1}. ${q}`} error={answers[i].length > 500 ? '请控制在 500 字以内' : null}>
            <Textarea
              aria-label={`问题 ${i + 1}`}
              rows={2}
              value={answers[i]}
              onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
              placeholder="可回答「不记得 / 没有」，不会卡住流程"
            />
          </Field>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            暂不填写
          </Button>
          <Button
            loading={busy}
            disabled={answers.every((a) => !a.trim())}
            onClick={() => void Promise.resolve(onSubmit(answers))}
          >
            提交并回填
          </Button>
        </div>
      </form>
    </Modal>
  );
}