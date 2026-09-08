/**
 * MDPreview（03 §8 / 06 §10.1 定位锚协议）：
 * react-markdown + remark-gfm 渲染 AI/简历 Markdown。
 * 两段式插件把 `<!--azi-loc:projects[0].bullets[1]-->` 注释（resume-render 产出）
 * 变成携带 data-azi-loc 的 span 供 ReflectionPanel 点击定位：
 * remarkAziLoc 在 mdast 层把注释替换为哨兵文本（默认管道会丢弃 raw html 节点），
 * rehypeAziLoc 再把哨兵文本替换为 span。
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root as MdRoot, Html } from 'mdast';
import type { Root, Element } from 'hast';
import { cn } from '../../lib/cn';

const AZI_LOC_PATTERN = /<!--\s*azi-loc:([A-Za-z0-9_[\]\.]+)\s*-->/;
const AZI_LOC_SENTINEL = '◈AZI-LOC◈';
const AZI_TEXT_PATTERN = /◈AZI-LOC◈([A-Za-z0-9_[\]\.]+)◈/;

/**
 * remark 插件：mdast 阶段把 azi-loc 注释替换为哨兵文本。
 * 已实测：react-markdown 默认管道会直接丢弃 raw html 注释节点（未开 allowDangerousHtml），
 * 因此必须在 remark 层转换，文本节点才能存活到 hast 供 rehype 插件消费。
 */
const remarkAziLoc: Plugin<[], MdRoot> = () => (tree) => {
  visit(tree, 'html', (node: Html, index, parent) => {
    const match = AZI_LOC_PATTERN.exec(node.value);
    if (!match || parent == null || index == null) return;
    parent.children[index] = { type: 'text', value: `${AZI_LOC_SENTINEL}${match[1]}◈` };
  });
};

/** rehype 插件：哨兵文本（独立或内嵌）替换为携带 data-azi-loc 的 span，供 ReflectionPanel 点击定位 */
const rehypeAziLoc: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'text', (node, index, parent) => {
    if (parent == null || index == null) return;
    const match = AZI_TEXT_PATTERN.exec(node.value);
    if (!match) return;
    const marker = `${AZI_LOC_SENTINEL}${match[1]}◈`;
    const span: Element = {
      type: 'element',
      tagName: 'span',
      properties: { 'data-azi-loc': match[1] },
      children: [],
    };
    if (node.value === marker) {
      parent.children[index] = span;
    } else {
      const [before, after] = node.value.split(marker);
      parent.children[index] = {
        type: 'element',
        tagName: 'span',
        properties: {},
        children: [
          { type: 'text', value: before },
          span,
          { type: 'text', value: after },
        ],
      };
    }
  });
};

/** ReflectionPanel 点击定位：滚动到对应锚点并短暂高亮（尊重 reduced-motion） */
export function scrollToAziLoc(loc: string): boolean {
  const el = document.querySelector<HTMLElement>(`[data-azi-loc="${CSS.escape(loc)}"]`);
  if (!el) return false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  el.style.transition = 'background-color 0.3s ease';
  el.style.backgroundColor = '#fef3c7';
  window.setTimeout(() => {
    el.style.backgroundColor = '';
  }, 1800);
  return true;
}

interface MDPreviewProps {
  markdown: string;
  className?: string;
  /** 全量禁用 azi-loc 高亮定位（如聊天场景复用） */
  plain?: boolean;
  ariaLabel?: string;
}

export function MDPreview({ markdown, className, plain, ariaLabel }: MDPreviewProps) {
  return (
    <div role={ariaLabel ? 'document' : undefined} aria-label={ariaLabel} className={cn('prose-azi', className)}>
      <ReactMarkdown
        remarkPlugins={plain ? [] : [remarkGfm, remarkAziLoc]}
        rehypePlugins={plain ? [] : [rehypeAziLoc]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}