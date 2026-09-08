'''
resumes 数据访问（04 §5.4）：按目标岗位分类，UNIQUE(user_id, target_role) → 409 target_role_exists
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.database.models import Resume
from backend.repositories.users import get_or_create_default_user
from backend.schemas.resumes import ResumePatch, ResumeWrite


def list_resumes(db: Session) -> list[Resume]:
    """全量列表（created_at 倒序）；?target_role= 分组筛选由前端处理，单用户量小"""
    return list(db.scalars(select(Resume).order_by(Resume.created_at.desc())))


def get(db: Session, resume_id: str) -> Optional[Resume]:
    return db.get(Resume, resume_id)


def get_by_target_role(db: Session, target_role: str) -> Optional[Resume]:
    """唯一约束检查用"""
    user_id = get_or_create_default_user(db).id
    return db.scalars(select(Resume).where(Resume.user_id == user_id, Resume.target_role == target_role)).first()


def create(db: Session, payload: ResumeWrite) -> Resume:
    """创建；target_role 已存在 raise ValueError("target_role_exists")，路由翻译 409（04 §6）。
    title 缺省取 target_role（前端 mock 同语义）"""
    if get_by_target_role(db, payload.target_role) is not None:
        raise ValueError(f"target_role_exists: 已有目标岗位为「{payload.target_role}」的简历")
    resume = Resume(
        user_id=get_or_create_default_user(db).id,
        title=payload.title or payload.target_role,
        target_role=payload.target_role,
    )
    db.add(resume)
    db.flush()
    db.refresh(resume)
    return resume


def update(db: Session, resume: Resume, payload: ResumePatch) -> Resume:
    """PATCH 改 title / template（04 §5.4；template 选定后 preview html 才可用）"""
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(resume, field, value)
    db.flush()
    db.refresh(resume)
    return resume


def delete(db: Session, resume: Resume) -> None:
    """删除；versions 级联删除，applications/hr_messages 的引用列 SET NULL（02 §7.2）"""
    db.delete(resume)
