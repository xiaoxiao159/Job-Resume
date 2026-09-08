'''
任务注册表（07 §5.2）：prompt_name → TaskDef

TaskDef 是「一个 LLM 任务的完整定义」，manager 执行管线时按它分派；
10 个任务逐步注册（tasks/ 包 import 各自模块，M1 先落 jd_analyze）。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent))

from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional

from sqlalchemy.orm import Session


@dataclass(frozen=True)
class TaskDef:
    '''任务定义（07 §5.2）

    - event_mode  "chunk"（文本型，流式 chunk 事件）/ "stage"（结构型，status 阶段事件）
    - assemble    ① 上下文装配（查库，返回 Jinja2 渲染变量 dict）；输入级问题抛 TaskInputError
    - parse       ④ 结构化任务：params + 原始文本 → Pydantic 模型；失败抛 ValueError（触发降级重试）；
                  文本任务为 None。带 params 因为输出结构可能随任务参数变化（project_expression 按 type 三态）
    - persist     ⑤ 落库：返回 {"refs": {...}, "result": {...}}（done 事件载荷，04 §3.2）
    - on_failure  任务失败后钩子（如 jd_analyses 置 failed），与管线同一次 DB 阶段提交
    - skip_llm    运行时谓词：params → True 则跳过 ③④（LLM/解析）直达落库——
                  resume_generate 的 Master 版（无 jd_id）纯程序装配用（05 §4.4 资产直取）
    '''
    prompt_name: str
    agent_type: str
    event_mode: Literal["chunk", "stage"]
    assemble: Callable[[Session, dict], dict]
    persist: Callable[[Session, dict, Any], dict]
    parse: Optional[Callable[[dict, str], Any]] = None
    on_failure: Optional[Callable[[Session, dict, str, str], None]] = None
    conflict_key: Optional[Callable[[dict], Optional[str]]] = None
    stages: tuple[str, ...] = field(default_factory=tuple)
    skip_llm: Optional[Callable[[dict], bool]] = None


def get_task(prompt_name: str) -> TaskDef:
    '''按 prompt_name 取任务定义（tasks/ 包惰性 import，避免循环依赖）'''
    from backend.services.agent_tasks.tasks import TASKS
    return TASKS[prompt_name]