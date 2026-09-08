'''
applications 数据访问（04 §5.6）：极简投递表格

- 列表：?status= 多值（逗号分隔）/ ?q=（公司或岗位 ILIKE）/ ?sort=（默认 -applied_at）
- 状态机：任意两态允许流转（PRD 未限定）；applied_at 为空且 status ≠ to_apply 的
  校验在路由层做（422，04 §5.6）——repo 只管数据
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.database.models import Application
from backend.repositories.users import get_or_create_default_user
from backend.schemas.applications import ApplicationPatch, ApplicationWrite


def list_applications(db: Session, *, page: int, per_page: int, status: Optional[str] = None,
                      q: Optional[str] = None, sort: Optional[str] = None) -> tuple[list[Application], int]:
    """分页列表（04 §2.3）：status 逗号多值、q 公司/岗位、sort 默认 -applied_at"""
    stmt = select(Application)
    count_stmt = select(func.count()).select_from(Application)
    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if statuses:
            cond = Application.status.in_(statuses)
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)
    if q:
        cond = or_(Application.company.ilike(f"%{q}%"), Application.position.ilike(f"%{q}%"))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    order_col = Application.applied_at
    descending = True
    if sort:
        descending = not sort.startswith("-")
        order_col = {
            "applied_at": Application.applied_at,
            "created_at": Application.created_at,
            "company": Application.company,
        }.get(sort.lstrip("-"), order_col)

    total = db.scalar(count_stmt) or 0
    order = order_col.desc().nulls_last() if descending else order_col.asc().nulls_last()
    rows = list(db.scalars(stmt.order_by(order).offset((page - 1) * per_page).limit(per_page)))
    return rows, total


def get(db: Session, application_id: str) -> Optional[Application]:
    return db.get(Application, application_id)


def create(db: Session, payload: ApplicationWrite) -> Application:
    application = Application(user_id=get_or_create_default_user(db).id, **payload.model_dump())
    db.add(application)
    db.flush()
    db.refresh(application)
    return application


def update(db: Session, application: Application, payload: ApplicationPatch) -> Application:
    """部分更新；状态流转 = PATCH status（路由层校验 applied_at 补全要求）"""
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(application, field, value)
    db.flush()
    db.refresh(application)
    return application


def delete(db: Session, application: Application) -> None:
    """删除；interview_qa.application_id SET NULL（02 §7.2）"""
    db.delete(application)


def resume_version_summary(db: Session, application: Application) -> Optional[dict]:
    """引用的简历版本摘要（04 §5.1）：{id, resume_title, version_number}；无引用为 None"""
    if application.resume_version_id is None:
        return None
    from backend.database.models import Resume, ResumeVersion
    row = db.execute(
        select(ResumeVersion.id, Resume.title, ResumeVersion.version_number)
        .join(Resume, Resume.id == ResumeVersion.resume_id)
        .where(ResumeVersion.id == application.resume_version_id)
    ).first()
    if row is None:
        return None
    return {"id": row[0], "resume_title": row[1], "version_number": row[2]}
