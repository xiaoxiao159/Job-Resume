'''
简历渲染（04 §5.4 / §10.4）：渲染由后端统一执行，前端零模板逻辑。

- render_markdown：MD 预览/锚点定位（06 §10.1 契约：每个项目 bullet 行后输出
  <!--azi-loc:projects[i].bullets[j]-->，ReflectionPanel 点击定位用）
- render_html：三套模板（classic / modern / minimal）内联 CSS 单文件 HTML，
  模板缺省回落 classic（前端 resume-render.ts 同规则）
- html_to_pdf：playwright 懒加载打印（requirements 默认未装，装了才可用）

错误约定（服务层不感知 HTTP）：raise ValueError("code: message")，路由翻译：
- "template_not_selected: …" → 409（HTML 预览/导出需先选模板）
- "pdf_not_available: …"     → 501（未安装 playwright）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from jinja2 import Environment, FileSystemLoader

TEMPLATES_DIR = Path(__file__).parent.parent / "templates"

# MD：纯文本输出，不做 Jinja 自动转义；用户内容经 esc 过滤器（对齐前端 esc()）
md_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=False,
    trim_blocks=True,
    lstrip_blocks=True,
)


def _esc(value: str) -> str:
    '''& < > 转义（镜像前端 resume-render.ts 的 esc，quotes 不动）'''
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


md_env.filters["esc"] = _esc


def _skill_line(skill: dict) -> str:
    '''技能 → “名称（熟练）”展示行（MD 与 HTML 共用）'''
    return f"{skill['name']}（{_labels(skill['proficiency'], PROFICIENCY_LABELS)}）"


md_env.filters["skill_line"] = _skill_line

# HTML：autoescape 直接全开（模板文件名以 .j2 结尾，select_autoescape 的
# 扩展名判定不适用；本环境只渲染 HTML，全开无副作用且比前端 esc 更严）
html_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=True,
    trim_blocks=True,
    lstrip_blocks=True,
)


def _nl2br(value: str) -> "Markup":
    '''先转义再换行 → <br>（autoescape 会把 replace 进去的 <br> 再转义，故需 safe 封装）'''
    from markupsafe import Markup, escape
    return Markup(str(escape(value)).replace("\n", "<br>"))


html_env.filters["skill_line"] = _skill_line
html_env.filters["nl2br"] = _nl2br

# 展示文案映射（02 §4 枚举值 → 中文展示，前端同表）
AVAILABILITY_LABELS = {
    "immediate": "立即到岗",
    "within_1_week": "一周内到岗",
    "within_2_weeks": "两周内到岗",
    "within_1_month": "一个月内到岗",
    "undecided": "到岗时间待定",
}
DEGREE_LABELS = {"bachelor": "本科", "master": "硕士", "phd": "博士"}
PROFICIENCY_LABELS = {"beginner": "了解", "familiar": "熟悉", "proficient": "熟练", "expert": "精通"}


def _labels(value: str, table: dict) -> str:
    return table.get(value, value)


def _context(content: dict) -> dict:
    return {
        "c": content,
        "availability_label": lambda v: _labels(v, AVAILABILITY_LABELS),
        "degree_label": lambda v: _labels(v, DEGREE_LABELS),
        "proficiency_label": lambda v: _labels(v, PROFICIENCY_LABELS),
    }


def render_markdown(content: dict) -> str:
    '''8 段快照 → Markdown（section 结构与前端 buildResumeMarkdown 镜像一致）'''
    return md_env.get_template("resume.md.j2").render(**_context(content))


def render_html(content: dict, template: Optional[str]) -> str:
    '''8 段快照 → 单文件 HTML；template 为空回落 classic（前端同规则）'''
    name = template if template in ("classic", "modern", "minimal") else "classic"
    return html_env.get_template(f"resume_{name}.html.j2").render(**_context(content))


def html_to_pdf(html: str) -> bytes:
    '''HTML → PDF（playwright Chromium 打印）；未安装时明确报错而非静默降级'''
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise ValueError(
            "pdf_not_available: PDF 导出需要 playwright（pip install playwright && playwright install chromium）"
        ) from exc
    from backend.infrastructure.config import settings
    with sync_playwright() as p:
        # 渠道可配（PDF_BROWSER_CHANNEL）：默认内置 chromium；"msedge"/"chrome" 用系统浏览器兜底
        browser = p.chromium.launch(channel=settings.PDF_BROWSER_CHANNEL or None)
        try:
            page = browser.new_page()
            page.set_content(html, wait_until="load")
            return page.pdf(format="A4", print_background=True,
                            margin={"top": "16mm", "bottom": "16mm", "left": "14mm", "right": "14mm"})
        finally:
            browser.close()
