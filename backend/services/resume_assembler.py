'''
简历 8 段装配（05 §4.4 装配分工 Mirror）：

- 事实段（basic_info / job_intention / education / research / campus / projects 骨架 /
  honors / skills）由程序从资产库拷贝——LLM 永不接触这些字段的生成
- 认知段（项目 bullets / 技能顺序 / 自我评价）三种来源：
  ① Master 版：confirmed resume_bullet 表达原文 → 资产事实字段兜底
  ② JD 定制版：reasoner 依据画像/匹配结果定制（ResumeGenerateOutput）
  ③ Studio 人工编辑：PATCH content 整体替换
- period 统一 "YYYY.MM - YYYY.MM"（在职中 end 为空 → 「至今」）

id 旁路约定：assemble_master(with_ids=True) 在每个 project dict 内附加 "_id"
（LLM 按此引用项目）；merge_with_llm 匹配后剥离，落库的 8 段契约不含 _id。
LLM 引用了不存在的 id / 技能名 → 静默忽略（05 决定 #4 的语义校验层）。
'''
import sys
from datetime import date
from pathlib import Path
from typing import Optional

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy.orm import Session

from backend.database.models import ExpressionType, ExperienceType, Resume
from backend.repositories import basic_info as basic_info_repo
from backend.repositories import educations as educations_repo
from backend.repositories import experiences as experiences_repo
from backend.repositories import honors as honors_repo
from backend.repositories import project_expressions as expressions_repo
from backend.repositories import projects as projects_repo
from backend.repositories import skills as skills_repo

SCHEMA_VERSION = 1

# 技能展示排序权重（Master 版默认序：精通 > 熟练 > 熟悉 > 了解）
_PROFICIENCY_ORDER = {"expert": 0, "proficient": 1, "familiar": 2, "beginner": 3}


def period_text(start: Optional[date], end: Optional[date]) -> str:
    """date 对 → 'YYYY.MM - YYYY.MM'；end 空 → 'YYYY.MM - 至今'；start 空 → ''"""
    def fmt(d: date) -> str:
        return f"{d.year}.{d.month:02d}"

    if start is None:
        return ""
    return f"{fmt(start)} - {fmt(end) if end else '至今'}"


def fallback_bullets(project) -> list[str]:
    """无 confirmed 表达时的 bullet 兜底：核心工作/简介/目标 + 方案与成果（mock 同规则）"""
    raw = [
        project.core_work or project.summary or project.goal,
        "，".join(x for x in (project.solutions, project.results) if x),
    ]
    return [b.strip() for b in raw if b and b.strip()]


def _project_entries(db: Session, *, with_ids: bool) -> list[dict]:
    """项目段装配（含 confirmed 表达优先 → 事实兜底）；无可写事实的项目整体跳过"""
    entries: list[dict] = []
    for p in projects_repo.list_all(db):
        confirmed = expressions_repo.latest_confirmed(db, p.id, ExpressionType.resume_bullet)
        bullets = (confirmed.content or {}).get("bullets") if confirmed else None
        if not bullets:
            bullets = fallback_bullets(p)
        if not bullets:
            continue
        entry = {
            "name": p.name,
            "period": period_text(p.start_date, p.end_date),
            "role": p.role or "",
            "tech_stack": list(p.tech_stack or []),
            "bullets": bullets,
            "github": p.github_url,
            "demo": p.demo_url,
        }
        if with_ids:
            entry["_id"] = p.id
        entries.append(entry)
    return entries


def assemble_master(db: Session, resume: Resume, *, with_ids: bool = False) -> dict:
    """Master 版 8 段全程序装配（05 §4.4 资产直取；无 LLM）；
    with_ids=True 供 JD 定制版 merge 用（见模块 docstring）"""
    basic = basic_info_repo.get_basic_info(db)

    skills = sorted(
        [{"name": s.name, "proficiency": s.proficiency.value} for s in skills_repo.list_skills(db)],
        key=lambda s: _PROFICIENCY_ORDER.get(s["proficiency"], 9),
    )

    experiences = experiences_repo.list_experiences(db)
    return {
        "schema_version": SCHEMA_VERSION,
        "basic_info": {
            "name": basic.name if basic else "未命名",
            "email": basic.email if basic else "",
            "phone": basic.phone if basic else "",
            "github": basic.github_url if basic else None,
            "homepage": basic.homepage_url if basic else None,
        },
        "job_intention": {
            "role": resume.target_role,
            "city": (basic.city if basic else "") or "",
            "availability": (basic.availability.value if basic and basic.availability else "within_1_week"),
        },
        "education": [
            {"school": e.school, "major": e.major, "degree": e.degree.value,
             "period": period_text(e.start_date, e.end_date), "courses": e.courses or ""}
            for e in educations_repo.list_educations(db)
        ],
        "research": [
            {"name": e.name, "role": e.role or "", "period": period_text(e.start_date, e.end_date),
             "description": e.description or ""}
            for e in experiences if e.type == ExperienceType.research
        ],
        "campus": [
            {"name": e.name, "role": e.role or "", "period": period_text(e.start_date, e.end_date),
             "description": e.description or ""}
            for e in experiences if e.type == ExperienceType.campus
        ],
        "projects": _project_entries(db, with_ids=with_ids),
        "honors": [{"name": h.name, "time": h.time or ""} for h in honors_repo.list_honors(db)],
        "skills": skills,
        "self_evaluation": (basic.self_evaluation if basic else "") or "",
    }


def merge_with_llm(facts: dict, output: dict) -> dict:
    """JD 定制版合并（05 §4.4）：事实段保持程序装配，认知段按 LLM 输出覆盖

    - output.projects：顺序即简历顺序（JD 相关在前）；按 _id 找回事实行，bullets 覆盖
    - output.skill_order：技能名（UNIQUE）重排；未提到的技能保持原序缀后
    - output.self_evaluation：非空覆盖
    - 引用不存在的 id / 技能名 → 忽略该项（防幻觉写库）
    """
    content = {**facts}

    if output.get("projects"):
        by_id = {p.get("_id"): p for p in facts["projects"]}
        merged, seen = [], set()
        for item in output["projects"]:
            target = by_id.get(item.get("id"))
            if target is None or item.get("id") in seen:
                continue
            seen.add(item.get("id"))
            bullets = [b for b in (item.get("bullets") or []) if b and b.strip()]
            if not bullets:
                continue
            merged.append({**target, "bullets": bullets})
        if merged:
            content["projects"] = merged

    if output.get("skill_order"):
        order = {name: i for i, name in enumerate(output["skill_order"])}
        content["skills"] = sorted(
            facts["skills"],
            key=lambda s: order.get(s["name"], len(order)),
        )

    if output.get("self_evaluation"):
        content["self_evaluation"] = output["self_evaluation"]

    # 剥离 _id 旁路：8 段契约（02 §6.1）不含此字段
    content["projects"] = [
        {k: v for k, v in p.items() if k != "_id"} for p in content["projects"]
    ]
    return content
