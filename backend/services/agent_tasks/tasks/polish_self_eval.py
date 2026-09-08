'''polish_self_eval 任务（05 §4.8）：润色自我评价——只改写表达、不新增事实，
chunk 流式展示建议，用户确认后 PUT /basic-info 落库（Human-in-the-loop）'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent.parent))

from sqlalchemy.orm import Session

from backend.repositories import basic_info as basic_info_repo
from backend.repositories import educations as educations_repo
from backend.repositories import projects as projects_repo
from backend.repositories import skills as skills_repo
from backend.services.agent_tasks.errors import TaskInputError
from backend.services.agent_tasks.registry import TaskDef


def _assemble(session: Session, params: dict) -> dict:
    '''① 上下文装配：基本信息 + 现有自评 + 资产概览（改写的事实依据）'''
    basic = basic_info_repo.get_basic_info(session)
    if basic is None:
        raise TaskInputError("not_found", "请先填写基本信息")

    skill_names = [s.name for s in skills_repo.list_skills(session)]
    project_names = [p.name for p in projects_repo.list_all(session)]
    majors = [e.major for e in educations_repo.list_educations(session) if e.major]

    return {
        "name": basic.name,
        "job_role": basic.job_role or "",
        "city": basic.city or "",
        "self_evaluation": basic.self_evaluation or "",
        "skill_names": "、".join(skill_names[:15]) or "（暂无技能记录）",
        "project_names": "、".join(project_names[:8]) or "（暂无项目记录）",
        "majors": "、".join(majors) or "（暂无教育记录）",
    }


def _persist(session: Session, params: dict, text: str) -> dict:
    '''⑤ 无落库：建议文案经 done.result.self_evaluation 交给前端预览确认'''
    return {"refs": {}, "result": {"self_evaluation": text.strip()}}


TASK = TaskDef(
    prompt_name="polish_self_eval",
    agent_type="asset_assist",
    event_mode="chunk",
    stages=(),
    assemble=_assemble,
    parse=None,
    persist=_persist,
    conflict_key=lambda params: "polish_self_eval",
)
