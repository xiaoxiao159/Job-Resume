'''
experiences 数据访问（04 §5.2）：科研/校园经历（同构三件套之二，02 决策 #2）

排序/校验约定与 educations.py 一致，见该文件 docstring。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import Experience
from backend.repositories.users import get_or_create_default_user
from backend.schemas.career_assets import ExperiencePatch, ExperienceWrite


def list_experiences(db: Session) -> list[Experience]:
    """全量列表，按 sort_order 升序"""
    return list(db.scalars(select(Experience).order_by(Experience.sort_order, Experience.created_at)))


def get(db: Session, experience_id: str) -> Experience | None:
    return db.get(Experience, experience_id)


def create(db: Session, payload: ExperienceWrite) -> Experience:
    experience = Experience(user_id=get_or_create_default_user(db).id, **payload.model_dump())
    db.add(experience)
    db.flush()
    db.refresh(experience)
    return experience


def update(db: Session, experience: Experience, payload: ExperiencePatch) -> Experience:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(experience, field, value)
    db.flush()
    db.refresh(experience)
    return experience


def delete(db: Session, experience: Experience) -> None:
    db.delete(experience)


def reorder(db: Session, ids: list[str]) -> None:
    """批量重排：ids 顺序即新 sort_order（0 起）"""
    rows = {r.id: r for r in list_experiences(db)}
    unknown = [i for i in ids if i not in rows]
    if unknown:
        raise ValueError(f"not_found: 经历记录 {unknown[0]} 不存在")
    if set(ids) != set(rows):
        raise ValueError("incomplete: ids 须覆盖全部经历记录")
    for index, row_id in enumerate(ids):
        rows[row_id].sort_order = index
    db.flush()
