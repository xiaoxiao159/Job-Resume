'''resume_generate 任务（05 §4.4）：8 段装配分工

- Master 版（无 jd_id）：纯程序装配（skip_llm），事实段拷贝 + confirmed 表达 bullets
- JD 定制版：reasoner 依据画像/匹配结果/指令输出认知三件（bullets/技能序/自评），
  程序 merge 回事实段——LLM 不接触事实字段（05 装配分工 Mirror）
- regenerate：based_on_version 内容作为风格基线注入 prompt；新版本号新行（02 决策 #5）
'''
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent.parent))

from sqlalchemy.orm import Session

from backend.database.models import JDAnalysis, JobDescription, Resume
from backend.schemas.llm_outputs import ResumeGenerateOutput
from backend.services import resume_assembler
from backend.services.agent_tasks.errors import TaskInputError
from backend.services.agent_tasks.parsing import extract_json
from backend.services.agent_tasks.registry import TaskDef
from backend.repositories import jd_matches as jd_matches_repo
from backend.repositories import resume_versions as versions_repo


def _json(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def _assemble(session: Session, params: dict) -> dict:
    '''① 上下文装配：简历 + JD 链（画像/匹配）+ 事实段（带 _id）+ 基线版本'''
    resume = session.get(Resume, params["resume_id"])
    if resume is None:
        raise TaskInputError("not_found", f"简历 {params['resume_id']} 不存在（可能已被删除）")

    facts = resume_assembler.assemble_master(session, resume, with_ids=True)

    jd_block = analysis_block = match_block = None
    if params.get("jd_id"):
        jd = session.get(JobDescription, params["jd_id"])
        if jd is None:
            raise TaskInputError("not_found", f"JD {params['jd_id']} 不存在（可能已被删除）")
        analysis = session.query(JDAnalysis).filter(JDAnalysis.jd_id == jd.id).first()
        if analysis is None:
            raise TaskInputError("analysis_not_ready", "该 JD 尚无岗位画像，请先运行分析")
        match = jd_matches_repo.latest_for_jd(session, jd.id)
        jd_block = {"title": jd.title or "", "company": jd.company or "", "raw_text": jd.raw_text}
        analysis_block = {
            "title": analysis.title or "",
            "core_skills": analysis.core_skills or [],
            "plus_skills": analysis.plus_skills or [],
            "responsibilities": analysis.responsibilities or [],
            "keywords": analysis.keywords or [],
        }
        if match is not None:
            match_block = {
                # DB Numeric → Decimal，json 不认；契约即 int（JDMatchRead）
                "overall_score": int(match.overall_score),
                "skill_matches": match.skill_matches or [],
                "advantages": match.advantages or [],
                "gaps": match.gaps or [],
            }

    base_content = None
    if params.get("based_on_version"):
        base = versions_repo.get(session, params["based_on_version"])
        if base is None:
            raise TaskInputError("not_found", f"基线版本 {params['based_on_version']} 不存在")
        base_content = base.content

    return {
        "mode": "regenerate" if params.get("based_on_version") else ("jd" if params.get("jd_id") else "master"),
        "target_role": resume.target_role,
        "instruction": params.get("instruction") or "",
        "facts_json": _json(facts),
        "jd_json": _json(jd_block),
        "analysis_json": _json(analysis_block),
        "match_json": _json(match_block),
        "base_content_json": _json(base_content),
    }


def _parse(params: dict, raw: str) -> ResumeGenerateOutput:
    '''④ 结构化解析（reasoner 围栏提取，失败由 manager 降级 chat 重试）'''
    return ResumeGenerateOutput.model_validate(extract_json(raw))


def _persist(session: Session, params: dict, parsed) -> dict:
    '''⑤ 落库：Master（parsed=None）程序装配；JD 版 merge 认知段；新版本号新行'''
    resume = session.get(Resume, params["resume_id"])
    if resume is None:
        raise TaskInputError("not_found", f"简历 {params['resume_id']} 不存在（可能已被删除）")

    facts = resume_assembler.assemble_master(session, resume, with_ids=True)
    if parsed is None:
        content = resume_assembler.assemble_master(session, resume)
    else:
        content = resume_assembler.merge_with_llm(facts, parsed.model_dump())

    version = versions_repo.create(
        session,
        resume_id=resume.id,
        version_number=versions_repo.next_version_number(session, resume.id),
        jd_id=params.get("jd_id"),
        content=content,
    )
    return {"refs": {"resume_version_id": version.id}, "result": None}


TASK = TaskDef(
    prompt_name="resume_generate",
    agent_type="resume_agent",
    event_mode="stage",
    stages=("正在装配事实段（资产库直取）…", "正在依据岗位画像定制认知段…"),
    assemble=_assemble,
    parse=_parse,
    persist=_persist,
    conflict_key=lambda params: f"resume_generate:{params.get('resume_id')}",
    # 仅 Master 初次生成（无 jd 且非重生成）走纯程序装配；regenerate 必须经 LLM
    # ——instruction（修改意见）只有 LLM 能消化（05 §4.4）
    skip_llm=lambda params: not params.get("jd_id") and not params.get("based_on_version"),
)
