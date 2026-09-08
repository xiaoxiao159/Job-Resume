'''jd_analyze 任务（05 §4.1）：JD 原文 → 岗位画像，落 jd_analyses（1:1 覆盖更新）'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import AnalysisStatus, JDAnalysis, JobDescription
from backend.schemas.llm_outputs import JdAnalysisOutput
from backend.services.agent_tasks.errors import TaskInputError
from backend.services.agent_tasks.parsing import extract_json
from backend.services.agent_tasks.registry import TaskDef


def _assemble(session: Session, params: dict) -> dict:
    '''① 上下文装配：JD 原文 + 可选标题/公司（05 §4.1 输入清单）'''
    jd = session.get(JobDescription, params["jd_id"])
    if jd is None:
        raise TaskInputError("not_found", f"JD {params['jd_id']} 不存在（可能已被删除）")
    return {
        "jd_id": jd.id,
        "title": jd.title or "",
        "company": jd.company or "",
        "raw_text": jd.raw_text,
    }


def _parse_structure(params: dict, raw: str) -> JdAnalysisOutput:
    '''④ 结构化解析：围栏提取（parsing.py）→ Pydantic 校验（05 §2.3）；params 未用（结构无参数化）'''
    return JdAnalysisOutput.model_validate(extract_json(raw))


def _persist(session: Session, params: dict, parsed: JdAnalysisOutput) -> dict:
    '''⑤ 落库：analysis 1:1 覆盖更新（04 §5.3 决策 #6 前半）'''
    jd_id = params["jd_id"]
    analysis = session.scalars(select(JDAnalysis).where(JDAnalysis.jd_id == jd_id)).first()
    data = parsed.model_dump()
    if analysis is None:
        # 触发路由已 upsert processing 行，此为兜底（任务在表空时被直接测试等场景）
        analysis = JDAnalysis(jd_id=jd_id, status=AnalysisStatus.completed, **data)
        session.add(analysis)
    else:
        for field, value in data.items():
            setattr(analysis, field, value)
        analysis.status = AnalysisStatus.completed
        analysis.error = None
    session.flush()
    return {"refs": {"jd_analysis_id": analysis.id}, "result": None}


def _on_failure(session: Session, params: dict, code: str, message: str) -> None:
    '''失败钩子：analysis 行置 failed + 错误原因（04 §5.3 processing/failed 状态语义）'''
    analysis = session.scalars(select(JDAnalysis).where(JDAnalysis.jd_id == params["jd_id"])).first()
    if analysis is not None:
        analysis.status = AnalysisStatus.failed
        analysis.error = message


TASK = TaskDef(
    prompt_name="jd_analyze",
    agent_type="jd_agent",
    event_mode="stage",
    stages=("正在分析 JD，提取岗位画像…",),
    assemble=_assemble,
    parse=_parse_structure,
    persist=_persist,
    on_failure=_on_failure,
    conflict_key=lambda params: f"jd_analyze:{params.get('jd_id')}",
)