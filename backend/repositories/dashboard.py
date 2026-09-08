'''
dashboard 统计查询（04 §5.1 / 02 §8 口径）：全部 SQL 聚合，程序负责确定性

- applied  = status <> 'to_apply'
- replied  = status IN ('replied', 'interview', 'offer')
- reply_rate = replied / applied（两位小数；applied=0 时为 0）
- recent_applications：applied_at 倒序取 5 条，JOIN 带出简历版本摘要
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.database.models import (
    Application,
    ApplicationStatus,
    BasicInfo,
    Education,
    Project,
    Skill,
)


def _count(db: Session, *conditions) -> int:
    stmt = select(func.count()).select_from(Application)
    if conditions:
        stmt = stmt.where(*conditions)
    return db.scalar(stmt) or 0


def get_stats(db: Session) -> dict:
    """统计四数 + 回复率（04 §5.1 stats 口径）"""
    applied = _count(db, Application.status != ApplicationStatus.to_apply)
    replied = _count(db, Application.status.in_([
        ApplicationStatus.replied, ApplicationStatus.interview, ApplicationStatus.offer,
    ]))
    interview = _count(db, Application.status == ApplicationStatus.interview)
    offer = _count(db, Application.status == ApplicationStatus.offer)
    reply_rate = round(replied / applied, 2) if applied else 0.0
    return {
        "applied": applied, "replied": replied, "interview": interview, "offer": offer,
        "reply_rate": reply_rate,
    }


def get_asset_progress(db: Session) -> dict:
    """资产盘点进度（04 §5.1）"""
    has_basic_info = db.scalars(select(BasicInfo.id).limit(1)).first() is not None
    return {
        "basic_info": has_basic_info,
        "projects_count": db.scalar(select(func.count()).select_from(Project)) or 0,
        "skills_count": db.scalar(select(func.count()).select_from(Skill)) or 0,
        "education_count": db.scalar(select(func.count()).select_from(Education)) or 0,
    }


def recent_applications(db: Session, limit: int = 5) -> list[Application]:
    """最近投递（applied_at 倒序，空值排最后）；版本摘要由路由层富化"""
    return list(db.scalars(
        select(Application)
        .order_by(Application.applied_at.desc().nulls_last(), Application.created_at.desc())
        .limit(limit)
    ))
