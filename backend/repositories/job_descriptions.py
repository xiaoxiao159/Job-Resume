'''
job_descriptions 数据访问（04 §5.3）：CRUD + latest_match_score 子查询带出
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import JDMatch, JobDescription
from backend.repositories.users import get_or_create_default_user
from backend.schemas.jd_analysis import JobDescriptionPatch, JobDescriptionWrite


def get(db: Session, jd_id: str) -> Optional[JobDescription]:
    return db.get(JobDescription, jd_id)


def latest_match_score(db: Session, jd_id: str) -> Optional[float]:
    '''该 JD 最新一次匹配的 overall_score（无匹配记录返回 None；行级 DTO 用）'''
    from sqlalchemy import select
    score = db.scalars(
        select(JDMatch.overall_score)
        .where(JDMatch.jd_id == jd_id)
        .order_by(JDMatch.created_at.desc())
        .limit(1)
    ).first()
    return float(score) if score is not None else None


def _latest_match_score_subquery():
    '''该 JD 最新一次 jd_matches 的 overall_score 标量子查询（04 §5.3 匹配留档 1:N）'''
    return (
        select(JDMatch.overall_score)
        .where(JDMatch.jd_id == JobDescription.id)
        .order_by(JDMatch.created_at.desc())
        .limit(1)
        .correlate(JobDescription)
        .scalar_subquery()
    )


def list_jds(db: Session, *, page: int, per_page: int, q: Optional[str] = None,
             sort: Optional[str] = None) -> tuple[list[JobDescription], list[float | None], int]:
    '''分页列表（04 §2.3）：?q= 标题/公司 ILIKE；?sort=-created_at'''
    from sqlalchemy import func

    latest_score = _latest_match_score_subquery()
    stmt = select(JobDescription)
    count_stmt = select(func.count()).select_from(JobDescription)
    if q:
        cond = (JobDescription.title.ilike(f"%{q}%")) | (JobDescription.company.ilike(f"%{q}%"))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    order_col = JobDescription.created_at
    descending = True
    if sort:
        descending = not sort.startswith("-")
        col_name = sort.lstrip("-")
        order_col = {"created_at": JobDescription.created_at, "title": JobDescription.title}.get(col_name, order_col)

    total = db.scalar(count_stmt) or 0
    order = order_col.desc() if descending else order_col.asc()
    rows = list(db.scalars(stmt.order_by(order).offset((page - 1) * per_page).limit(per_page)))
    if not rows:
        return rows, [], total
    # 注意不能用 dict(db.execute(...))：Result 带 .keys() 会被 dict 当 mapping 走下标路径报错
    score_map = {
        jd_id: score for jd_id, score in db.execute(
            select(JobDescription.id, latest_score).where(JobDescription.id.in_([r.id for r in rows]))
        )
    }
    return rows, [score_map.get(r.id) for r in rows], total


def create(db: Session, payload: JobDescriptionWrite) -> JobDescription:
    jd = JobDescription(user_id=get_or_create_default_user(db).id, **payload.model_dump())
    db.add(jd)
    db.flush()
    db.refresh(jd)
    return jd


def update(db: Session, jd: JobDescription, payload: JobDescriptionPatch) -> JobDescription:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(jd, field, value)
    db.flush()
    db.refresh(jd)
    return jd


def delete(db: Session, jd: JobDescription) -> None:
    db.delete(jd)