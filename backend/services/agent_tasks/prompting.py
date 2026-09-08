'''
Prompts 渲染（05 §3：Jinja2 模板管理 + 两段式结构）：

- 一个任务一个模板文件（prompts/{prompt_name}.md.j2），
  文件内以 `{# ---- user ---- #}` 标记分隔 System / User 两段（05 §3.2）
- shared 片段走 {% include '_partials/…' %}，禁止复制粘贴
- estimate_tokens：上下文预算断言用粗算（05 §5.2 显式报错防静默截断）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent))

from functools import lru_cache

import jinja2

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"

# 两段分隔标记（05 §3.2：System = 角色+任务+安全+输出契约；User = 数据+指令）
_SECTION_MARKER = "{# ---- user ---- #}"


@lru_cache(maxsize=1)
def _env() -> jinja2.Environment:
    return jinja2.Environment(
        loader=jinja2.FileSystemLoader(PROMPTS_DIR),
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )


def render_messages(prompt_name: str, **context) -> list[dict]:
    '''模板渲染为 OpenAI messages：[{role: system, content}, {role: user, content}]

    分段在模板**源码**上做（渲染前）：标记是 Jinja2 注释，渲染时会被 trim_blocks
    删除，因此在渲染产物里查找标记永远失败。源码切两段后独立渲染，标记不泄露进 prompt。
    '''
    env = _env()
    source = env.loader.get_source(env, f"{prompt_name}.md.j2")[0]
    if _SECTION_MARKER not in source:
        raise ValueError(f"prompt 模板缺少两段标记 {_SECTION_MARKER}：{prompt_name}")
    system_src, user_src = source.split(_SECTION_MARKER, 1)
    system = env.from_string(system_src).render(**context).strip()
    user = env.from_string(user_src).render(**context).strip()
    if not system or not user:
        raise ValueError(f"prompt 模板两段均须非空：{prompt_name}")
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def estimate_tokens(text: str) -> int:
    '''粗估 token 数（05 §5.2 预算断言用）：CJK 字符 ≈ 1 token，其余按词计'''
    cjk = sum(1 for ch in text if "一" <= ch <= "鿿")
    words = len(text.encode("ascii", "ignore").split())
    return cjk + words