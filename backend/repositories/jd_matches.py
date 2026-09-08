'''
jd_matches 数据访问（04 §5.3 / 02 §4.13）：每次匹配留档（1:N，决策 #6）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import JDMatch


def list_for_jd(db: Session, jd_id: str) -> list[JDMatch]:
    """留档列表，最新在前（created_at 倒序）"""
    return list(db.scalars(
        select(JDMatch).where(JDMatch.jd_id == jd_id).order_by(JDMatch.created_at.desc())
    ))


def get(db: Session, match_id: str) -> Optional[JDMatch]:
    return db.get(JDMatch, match_id)


def latest_for_jd(db: Session, jd_id: str) -> Optional[JDMatch]:
    """最新一次匹配（resume_generate 选取项目依据，05 §4.4 装配清单 1）"""
    return db.scalars(
        select(JDMatch).where(JDMatch.jd_id == jd_id).order_by(JDMatch.created_at.desc()).limit(1)
    ).first()


def create(db: Session, *, jd_id: str, overall_score: Optional[int],
           skill_matches: list[dict], matched_project_ids: list[str],
           advantages: list[str], gaps: list[str]) -> JDMatch:
    """任务协程落库用：overall_score 为程序计算结果（05 决定 #8，LLM 不产分）"""
    match = JDMatch(
        jd_id=jd_id, overall_score=overall_score,
        skill_matches=[{"name": m["name"], "status": m["status"]} for m in skill_matches],  # 剥离 matched_asset（02 §6.4 无此字段）
        matched_project_ids=matched_project_ids, advantages=advantages, gaps=gaps,
    )
    db.add(match)
    db.flush()
    db.refresh(match)
    return match
