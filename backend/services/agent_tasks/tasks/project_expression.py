'''project_expression 任务（05 §4.3）：项目事实 → 场景表达（三态结构），draft 落库等人工确认'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent.parent))

from sqlalchemy.orm import Session

from backend.database.models import ExpressionType, Project
from backend.schemas.llm_outputs import InterviewOutput, ResumeBulletOutput, StarOutput
from backend.services.agent_tasks.errors import TaskInputError
from backend.services.agent_tasks.parsing import extract_json
from backend.services.agent_tasks.registry import TaskDef
from backend.repositories import evidence as evidence_repo
from backend.repositories import project_expressions as expressions_repo

# type → 输出模型（02 §6.3 content 三态联合）
_OUTPUT_BY_TYPE = {
    ExpressionType.resume_bullet: ResumeBulletOutput,
    ExpressionType.interview: InterviewOutput,
    ExpressionType.star: StarOutput,
}


def _assemble(session: Session, params: dict) -> dict:
    '''① 上下文装配：项目七字段 + 证据列表（05 §4.3 输入清单）'''
    project = session.get(Project, params["project_id"])
    if project is None:
        raise TaskInputError("not_found", f"项目 {params['project_id']} 不存在（可能已被删除）")
    expr_type = ExpressionType(params["type"])

    fields = {
        "name": project.name,
        "summary": project.summary or "",
        "background": project.background or "",
        "goal": project.goal or "",
        "role": project.role or "",
        "tech_stack": list(project.tech_stack or []),
        "responsibilities": project.responsibilities or "",
        "core_work": project.core_work or "",
        "difficulties": project.difficulties or "",
        "solutions": project.solutions or "",
        "results": project.results or "",
    }
    evidence = [
        {"type": e.type.value, "title": e.title, "url": e.url or "", "note": e.note or ""}
        for e in evidence_repo.list_for_project(session, project.id)
    ]
    return {
        "project": fields,
        "evidence": evidence,
        "type": params["type"],
        "type_label": {"resume_bullet": "简历 bullet", "interview": "面试自述", "star": "STAR 复盘"}[params["type"]],
    }


def _parse(params: dict, raw: str) -> dict:
    '''④ 结构化解析：输出结构随 type 三态（带 params 的原因，07 §5.2）'''
    model = _OUTPUT_BY_TYPE[ExpressionType(params["type"])]
    return model.model_validate(extract_json(raw)).model_dump()


def _persist(session: Session, params: dict, parsed: dict) -> dict:
    '''⑤ 落库：draft 新行（Human-in-the-loop 由 PATCH /project-expressions/{id} 确认）'''
    expression = expressions_repo.create(
        session,
        project_id=params["project_id"],
        expr_type=ExpressionType(params["type"]),
        version_number=expressions_repo.next_version_number(
            session, params["project_id"], ExpressionType(params["type"])
        ),
        content=parsed,
    )
    return {"refs": {"project_expression_id": expression.id}, "result": None}


TASK = TaskDef(
    prompt_name="project_expression",
    agent_type="project_agent",
    event_mode="stage",
    stages=("正在阅读项目事实与证据…", "正在撰写场景表达…"),
    assemble=_assemble,
    parse=_parse,
    persist=_persist,
    conflict_key=lambda params: f"project_expression:{params.get('project_id')}:{params.get('type')}",
)
