'''
AI 辅助填写三任务（05 §4.7）：两段式无状态多轮（04 决策 #4，前端持历史全量发送）

- assist_questionnaire：第一段问卷 → 追问（chunk 流式 + done.result.follow_up）
- assist_chat：第二段自由对话 → 挖掘式追问（chunk 流式，无落库）
- assist_refill：STOP 并回填 → 七字段提炼建议（json_object，done.result.fields）

三个任务共享装配（项目事实 + 对话历史）与冲突域（assist:{project_id}——
同一项目的辅助会话一次只跑一个）。
'''
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent.parent))

from sqlalchemy.orm import Session

from backend.database.models import Project
from backend.schemas.llm_outputs import RefillFieldsOutput
from backend.services.agent_tasks.errors import TaskInputError
from backend.services.agent_tasks.parsing import extract_json
from backend.services.agent_tasks.registry import TaskDef


def _project_or_error(session: Session, project_id: str) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise TaskInputError("not_found", f"项目 {project_id} 不存在（可能已被删除）")
    return project


def _project_block(project: Project) -> dict:
    return {
        "name": project.name,
        "summary": project.summary or "",
        "background": project.background or "",
        "goal": project.goal or "",
        "role": project.role or "",
        "responsibilities": project.responsibilities or "",
        "core_work": project.core_work or "",
        "difficulties": project.difficulties or "",
        "solutions": project.solutions or "",
        "results": project.results or "",
    }


def _assemble_project(session: Session, params: dict) -> dict:
    project = _project_or_error(session, params["project_id"])
    return {
        "project_json": json.dumps(_project_block(project), ensure_ascii=False),
        "messages_json": json.dumps(params.get("messages") or [], ensure_ascii=False),
        "answers_json": json.dumps(params.get("answers") or [], ensure_ascii=False),
    }


# ---------------------------------------------------------------- questionnaire

def _assemble_questionnaire(session: Session, params: dict) -> dict:
    '''① 项目七字段（哪些为空）+ 第一段问卷全部作答'''
    context = _assemble_project(session, params)
    context["empty_fields"] = "、".join(
        label for label in ("background", "goal", "responsibilities", "core_work",
                            "difficulties", "solutions", "results")
        if not getattr(_project_or_error(session, params["project_id"]), label)
    ) or "（无）"
    return context


def _persist_noop(session: Session, params: dict, text: str) -> dict:
    '''⑤ 无落库：追问文案经 done.result 交给前端进第二段对话'''
    return {"refs": {}, "result": {"follow_up": text.strip()}}


QUESTIONNAIRE_TASK = TaskDef(
    prompt_name="assist_questionnaire",
    agent_type="asset_assist",
    event_mode="chunk",
    stages=(),
    assemble=_assemble_questionnaire,
    parse=None,
    persist=_persist_noop,
    conflict_key=lambda params: f"assist:{params.get('project_id')}",
)


# ---------------------------------------------------------------- chat

def _persist_noop_empty(session: Session, params: dict, text: str) -> dict:
    '''⑤ 无落库：对话历史由前端持有（无会话表，04 决策 #4）'''
    return {"refs": {}, "result": None}


CHAT_TASK = TaskDef(
    prompt_name="assist_chat",
    agent_type="asset_assist",
    event_mode="chunk",
    stages=(),
    assemble=_assemble_project,
    parse=None,
    persist=_persist_noop_empty,
    conflict_key=lambda params: f"assist:{params.get('project_id')}",
)


# ---------------------------------------------------------------- refill

def _parse_refill(params: dict, raw: str) -> RefillFieldsOutput:
    '''④ 结构化解析（chat 档 json_object）'''
    return RefillFieldsOutput.model_validate(extract_json(raw))


def _persist_refill(session: Session, params: dict, parsed: RefillFieldsOutput) -> dict:
    '''⑤ 无落库：字段建议经 done.result.fields 交给前端回填表单（用户确认后 PATCH）'''
    return {"refs": {}, "result": {"fields": parsed.model_dump()}}


REFILL_TASK = TaskDef(
    prompt_name="assist_refill",
    agent_type="asset_assist",
    event_mode="chunk",
    stages=(),
    assemble=_assemble_project,
    parse=_parse_refill,
    persist=_persist_refill,
    conflict_key=lambda params: f"assist:{params.get('project_id')}",
)
