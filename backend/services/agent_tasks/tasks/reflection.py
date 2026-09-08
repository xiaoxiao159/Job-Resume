'''reflection 任务（05 §4.5）：真实性自检 + 关键词覆盖裁决

分工（07 §7.1 分数与事实由程序保证）：
- 程序侧（reflection_checks.py）：项目存在性/数字核对 = 确定性 issue；
  子串匹配给出关键词覆盖基线 + 技术词白名单候选
- LLM 侧：裁决 missing 关键词是否同义已覆盖（改判 hit）；裁决技术词候选是否
  真的作为「使用过的技术」陈述（定罪 tech_not_in_assets）；补充自检发现
- match_score 由程序按 LLM 最终 hit/missing 分类计算（scoring.py），LLM 不产分
'''
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent.parent))

from sqlalchemy.orm import Session

from backend.database.models import ReflectionStatus, ResumeVersion
from backend.schemas.llm_outputs import ReflectionOutput
from backend.services import reflection_checks, scoring
from backend.services.agent_tasks.errors import TaskInputError
from backend.services.agent_tasks.parsing import extract_json
from backend.services.agent_tasks.registry import TaskDef
from backend.repositories import resume_versions as versions_repo


def _json(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def _assemble(session: Session, params: dict) -> dict:
    '''① 上下文装配：版本内容 + 关键词 + 程序基线（issue/覆盖/候选）'''
    version = session.get(ResumeVersion, params["resume_version_id"])
    if version is None:
        raise TaskInputError("not_found", f"简历版本 {params['resume_version_id']} 不存在")
    if version.confirmed_at is not None:
        raise TaskInputError("locked_version", "定稿版本不可再校验")

    program_issues = reflection_checks.fabrication_issues(session, version.content)
    hit, missing = reflection_checks.keyword_coverage(session, version.jd_id, version.content)
    candidates = reflection_checks.tech_candidates(session, version.content)

    return {
        "content_json": _json(version.content),
        "program_issues_json": _json(program_issues),
        "hit_keywords_json": _json(hit),
        "missing_keywords_json": _json(missing),
        "tech_candidates_json": _json(candidates),
    }


def _parse(params: dict, raw: str) -> ReflectionOutput:
    '''④ 结构化解析（reasoner 围栏提取）'''
    return ReflectionOutput.model_validate(extract_json(raw))


def _persist(session: Session, params: dict, parsed: ReflectionOutput) -> dict:
    '''⑤ 落库：程序 issue（确定性）+ LLM issue 合并去重；hit/missing 过滤回已知关键词集'''
    version = session.get(ResumeVersion, params["resume_version_id"])
    if version is None:
        raise TaskInputError("not_found", f"简历版本 {params['resume_version_id']} 不存在")

    program_issues = reflection_checks.fabrication_issues(session, version.content)
    program_hit, program_missing = reflection_checks.keyword_coverage(session, version.jd_id, version.content)
    known_keywords = set(program_hit) | set(program_missing)

    # LLM 关键词分类只认输入清单内的词（防幻觉扩集）；无 JD 时空集
    hit = [k for k in parsed.hit_keywords if k in known_keywords]
    missing = [k for k in parsed.missing_keywords if k in known_keywords and k not in set(hit)]

    issues = [{**i.model_dump()} for i in program_issues]
    seen = {(i["location"], i["claim"]) for i in issues}
    for issue in parsed.issues:
        key = (issue.location, issue.claim)
        if key not in seen:
            seen.add(key)
            issues.append(issue.model_dump())

    score = scoring.match_score(len(hit), len(missing))
    result = {
        "match_score": 100 if score is None else score,   # 无关键词（Master 版）→ 无从缺项
        "coverage": {"hit_keywords": hit, "missing_keywords": missing},
        "fabrication": {"passed": not issues, "issues": issues},
    }
    status = ReflectionStatus.passed if not issues else ReflectionStatus.issues
    version = versions_repo.apply_reflection(session, version, status=status, result=result)
    return {"refs": {"resume_version_id": version.id}, "result": None}


TASK = TaskDef(
    prompt_name="reflection",
    agent_type="resume_agent",
    event_mode="stage",
    stages=("正在核对项目与数字（程序检查）…", "正在裁决关键词覆盖与技术词…"),
    assemble=_assemble,
    parse=_parse,
    persist=_persist,
    conflict_key=lambda params: f"reflection:{params.get('resume_version_id')}",
)
