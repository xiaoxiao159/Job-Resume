'''jd_match 任务（05 §4.2）：画像技能 × 资产库 → 三态匹配，overall_score 程序算，落 jd_matches'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent.parent))

from sqlalchemy.orm import Session

from backend.database.models import JDAnalysis, JobDescription
from backend.schemas.llm_outputs import JdMatchOutput
from backend.services import scoring
from backend.services.agent_tasks.errors import TaskInputError
from backend.services.agent_tasks.parsing import extract_json
from backend.services.agent_tasks.registry import TaskDef
from backend.repositories import jd_matches as jd_matches_repo
from backend.repositories import projects as projects_repo
from backend.repositories import skills as skills_repo


def _assemble(session: Session, params: dict) -> dict:
    '''① 上下文装配：JD 画像 + 用户技能 + 项目事实（05 §4.2 输入清单）'''
    jd = session.get(JobDescription, params["jd_id"])
    if jd is None:
        raise TaskInputError("not_found", f"JD {params['jd_id']} 不存在（可能已被删除）")
    analysis = session.query(JDAnalysis).filter(JDAnalysis.jd_id == jd.id).first()
    if analysis is None:
        raise TaskInputError("analysis_not_ready", "该 JD 尚无岗位画像，请先运行分析")

    jd_skills = [
        {"name": s["name"], "stars": s["stars"]}
        for s in (analysis.core_skills or []) + (analysis.plus_skills or [])
    ]
    skills = [{"name": s.name, "proficiency": s.proficiency.value} for s in skills_repo.list_skills(session)]
    projects = [
        {
            "id": p.id, "name": p.name, "summary": p.summary or "",
            "role": p.role or "", "tech_stack": list(p.tech_stack or []),
            "core_work": p.core_work or "", "results": p.results or "",
        }
        for p in projects_repo.list_all(session)
    ]
    return {
        "jd_title": jd.title or "",
        "jd_company": jd.company or "",
        "jd_skills": jd_skills,
        "keywords": analysis.keywords or [],
        "user_skills": skills,
        "projects": projects,
    }


def _parse(params: dict, raw: str) -> JdMatchOutput:
    '''④ 结构化解析（chat 档 json_object）'''
    return JdMatchOutput.model_validate(extract_json(raw))


def _persist(session: Session, params: dict, parsed: JdMatchOutput) -> dict:
    '''⑤ 落库：overall_score 程序计算（05 决定 #8），skill_matches 剥离 matched_asset'''
    analysis = session.query(JDAnalysis).filter(JDAnalysis.jd_id == params["jd_id"]).first()
    core = {s["name"]: s["stars"] for s in (analysis.core_skills or [])}
    plus = {s["name"]: s["stars"] for s in (analysis.plus_skills or [])}
    strong = {m.name for m in parsed.skill_matches if m.status == "strong"}
    partial = {m.name for m in parsed.skill_matches if m.status == "partial"}
    missing = {m.name for m in parsed.skill_matches if m.status == "missing"}

    match = jd_matches_repo.create(
        session,
        jd_id=params["jd_id"],
        overall_score=scoring.overall_score(core, plus, strong, partial, missing),
        skill_matches=[{"name": m.name, "status": m.status} for m in parsed.skill_matches],
        matched_project_ids=parsed.matched_project_ids,
        advantages=parsed.advantages,
        gaps=parsed.gaps,
    )
    return {"refs": {"jd_match_id": match.id}, "result": None}


TASK = TaskDef(
    prompt_name="jd_match",
    agent_type="jd_agent",
    event_mode="stage",
    stages=("正在核对技能要求…", "正在计算匹配度…"),
    assemble=_assemble,
    parse=_parse,
    persist=_persist,
    conflict_key=lambda params: f"jd_match:{params.get('jd_id')}",
)
