'''
projects 数据访问（04 §5.2）：核心资产表

- 列表支持 ?q=（名称 ILIKE）与 ?sort=（04 §2.3），DataList 分页（前端 apiList 契约）
- DELETE 级联 evidence / project_expressions / project_skills（FK CASCADE，02 §7.2）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.database.models import Project
from backend.repositories.users import get_or_create_default_user
from backend.schemas.career_assets import ProjectPatch, ProjectWrite


def list_projects(db: Session, *, page: int, per_page: int, q: Optional[str] = None,
                  sort: Optional[str] = None) -> tuple[list[Project], int]:
    """分页列表：?q= 名称 ILIKE；?sort=-created_at（默认 -created_at）"""
    stmt = select(Project)
    count_stmt = select(func.count()).select_from(Project)
    if q:
        cond = Project.name.ilike(f"%{q}%")
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    order_col = Project.created_at
    descending = True
    if sort:
        descending = not sort.startswith("-")
        order_col = {
            "created_at": Project.created_at,
            "name": Project.name,
            "sort_order": Project.sort_order,
        }.get(sort.lstrip("-"), order_col)

    total = db.scalar(count_stmt) or 0
    order = order_col.desc() if descending else order_col.asc()
    rows = list(db.scalars(stmt.order_by(order).offset((page - 1) * per_page).limit(per_page)))
    return rows, total


def get(db: Session, project_id: str) -> Optional[Project]:
    return db.get(Project, project_id)


def create(db: Session, payload: ProjectWrite) -> Project:
    project = Project(user_id=get_or_create_default_user(db).id, **payload.model_dump())
    db.add(project)
    db.flush()
    db.refresh(project)
    return project


def update(db: Session, project: Project, payload: ProjectPatch) -> Project:
    """部分更新；AI 回填确认 = 前端 diff 后提交此端点（04 §5.2 ④）"""
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.flush()
    db.refresh(project)
    return project


def delete(db: Session, project: Project) -> None:
    db.delete(project)


def list_all(db: Session) -> list[Project]:
    """全量（按 sort_order）——agent 任务装配 / dashboard 计数用"""
    return list(db.scalars(select(Project).order_by(Project.sort_order, Project.created_at)))


def count_projects(db: Session) -> int:
    """dashboard asset_progress 用"""
    return db.scalar(select(func.count()).select_from(Project)) or 0
