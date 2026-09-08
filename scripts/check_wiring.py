'''一次性自检脚本：打印全部路由 + 任务注册表 + 模板清单'''
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import backend.main as m

print(f"routes: {len(m.app.routes)}")
for r in m.app.routes:
    print(" ", sorted(getattr(r, "methods", []) or []), getattr(r, "path", r))

from backend.services.agent_tasks.tasks import TASKS

print(f"\ntasks ({len(TASKS)}):")
for name, td in TASKS.items():
    print(f"  {name:24s} prompt={td.prompt_name} mode={td.event_mode} skip_llm={td.skip_llm is not None}")

import pathlib

from backend.services.agent_tasks.registry import TaskDef  # noqa: F401  (确认可导入)
from backend.services.rendering import render_html, render_markdown  # noqa: F401

prompts = sorted(p.name for p in pathlib.Path("backend/prompts").glob("*.md.j2"))
print(f"\nprompts ({len(prompts)}):")
for p in prompts:
    print(" ", p)
