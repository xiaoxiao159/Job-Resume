'''
Reflection 程序侧检查（04 §5.4 / 02 §6.5）：确定性部分，LLM 不参与

分工原则（07「分数与事实由程序保证」）：
- 项目存在性 / 数字核对 → 确定性 issue，直接定罪（fabrication.definitive）
- 技术词白名单未命中 → 候选，交 LLM 裁决是否真作为「使用过的技术」陈述
  （reflection 任务注入；本模块只产出候选，不下结论）
- 关键词覆盖 → 子串匹配做基线，reflection 任务交 LLM 同义改判 hit/missing，
  match_score 一律由程序按最终 hit/missing 计算，LLM 不产分数

location 格式与前端 azi-loc 锚点一致（06 §10.1）：projects[i].bullets[j]
'''
import re
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy.orm import Session

from backend.repositories import jd_analyses as jd_analyses_repo
from backend.repositories import projects as projects_repo
from backend.repositories import skills as skills_repo

# 显著数字：百分比 / 万亿级 / k 级 / 三位以上（跳过「3 个模块」这类结构性小整数）
_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?\s*(?:%|万|亿|[kKwW])|\d{3,}")

# 常见技术词词典（大小写不敏感扫描；命中且不在用户资产白名单 → LLM 裁决候选）
TECH_LEXICON = [
    "python", "java", "golang", "rust", "c\\+\\+", "typescript", "javascript",
    "react", "vue", "angular", "next\\.js", "node\\.js", "flutter",
    "fastapi", "django", "flask", "spring", "springboot",
    "mysql", "postgresql", "mongodb", "redis", "elasticsearch", "kafka", "rabbitmq",
    "docker", "kubernetes", "k8s", "nginx", "linux", "jenkins", "terraform",
    "pytorch", "tensorflow", "transformers", "langchain", "openai",
    "spark", "flink", "hadoop", "hive", "airflow", "grpc", "graphql",
    "git", "ci/cd", "microservice", "微服务", "分布式", "消息队列",
]


def _content_text(content: dict) -> str:
    """全部文本压平（关键词覆盖子串匹配用）"""
    parts: list[str] = []

    def _walk(node) -> None:
        if isinstance(node, dict):
            for v in node.values():
                _walk(v)
        elif isinstance(node, list):
            for v in node:
                _walk(v)
        elif isinstance(node, str):
            parts.append(node)

    _walk(content)
    return "\n".join(parts)


def _project_asset_text(project) -> str:
    """单个资产项目的全部事实文本（数字核对的白名单来源）"""
    fields = [project.summary, project.background, project.goal, project.responsibilities,
              project.core_work, project.difficulties, project.solutions, project.results,
              " ".join(project.tech_stack or [])]
    return "\n".join(f for f in fields if f)


def fabrication_issues(db: Session, content: dict) -> list[dict]:
    """确定性造谣检查：项目存在性 + 数字核对（02 §6.5 issue 结构）"""
    issues: list[dict] = []
    asset_projects = {p.name: p for p in projects_repo.list_all(db)}

    for i, p in enumerate(content.get("projects") or []):
        asset = asset_projects.get(p["name"])
        if asset is None:
            issues.append({
                "location": f"projects[{i}].name",
                "claim": p["name"],
                "type": "project_not_in_assets",
            })
            continue
        asset_text = _project_asset_text(asset)
        for j, bullet in enumerate(p.get("bullets") or []):
            for number in _NUMBER_RE.findall(bullet):
                if number not in asset_text:
                    issues.append({
                        "location": f"projects[{i}].bullets[{j}]",
                        "claim": number,
                        "type": "number_not_in_assets",
                    })
    return issues


def tech_candidates(db: Session, content: dict) -> list[str]:
    """bullet/tech_stack 中出现、但不在用户技能 ∪ 全部项目技术栈白名单的技术词候选"""
    whitelist = {s.name.lower() for s in skills_repo.list_skills(db)}
    for p in projects_repo.list_all(db):
        whitelist.update(t.lower() for t in (p.tech_stack or []))

    candidates: set[str] = set()
    projects = content.get("projects") or []
    texts = [b for p in projects for b in (p.get("bullets") or [])]
    texts += [t for p in projects for t in (p.get("tech_stack") or [])]
    for text in texts:
        for term in TECH_LEXICON:
            if re.search(term, text, flags=re.IGNORECASE):
                plain = term.replace("\\", "")
                if plain.lower() not in whitelist:
                    candidates.add(plain)
    return sorted(candidates)


def keyword_coverage(db: Session, jd_id: Optional[str], content: dict) -> tuple[list[str], list[str]]:
    """关键词覆盖基线（子串匹配）：返回 (hit, missing)；无 JD / 无关键词 → ([], [])"""
    if not jd_id:
        return [], []
    analysis = jd_analyses_repo.get_for_jd(db, jd_id)
    if analysis is None or not analysis.keywords:
        return [], []
    text = _content_text(content)
    hit = [kw for kw in analysis.keywords if kw in text]
    missing = [kw for kw in analysis.keywords if kw not in text]
    return hit, missing


def match_score(hit: list[str], missing: list[str]) -> int:
    """match_score = hit / (hit + missing) * 100，四舍五入；无关键词 → 100（无从判定缺项）"""
    total = len(hit) + len(missing)
    if total == 0:
        return 100
    return round(100 * len(hit) / total)


def program_reflect(db: Session, version) -> dict:
    """完整程序侧结果（02 §6.5 结构）：confirm 未 reflect 时的同步兜底，
    也作为 reflection 任务的确定性基线（LLM 只改判 missing 关键词与 tech 候选）"""
    issues = fabrication_issues(db, version.content)
    hit, missing = keyword_coverage(db, version.jd_id, version.content)
    return {
        "match_score": match_score(hit, missing),
        "coverage": {"hit_keywords": hit, "missing_keywords": missing},
        "fabrication": {"passed": not issues, "issues": issues},
    }
