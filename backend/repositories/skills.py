'''
skills 数据访问（04 §5.2）：带熟练度技能，UNIQUE(user_id, name) → 409 skill_name_exists
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.database.models import Skill
from backend.repositories.users import get_or_create_default_user
from backend.schemas.career_assets import SkillPatch, SkillWrite


def list_skills(db: Session) -> list[Skill]:
    """全量列表（前端 mock 按名称排序展示，此处沿用 name 排序）"""
    return list(db.scalars(select(Skill).order_by(Skill.name)))


def get(db: Session, skill_id: str) -> Skill | None:
    return db.get(Skill, skill_id)


def get_by_name(db: Session, name: str) -> Skill | None:
    """重名检查用（UNIQUE(user_id, name)）"""
    user_id = get_or_create_default_user(db).id
    return db.scalars(select(Skill).where(Skill.user_id == user_id, Skill.name == name)).first()


def create(db: Session, payload: SkillWrite) -> Skill:
    """创建；重名 raise ValueError("skill_name_exists")，路由翻译 409（04 §6）"""
    if get_by_name(db, payload.name) is not None:
        raise ValueError(f"skill_name_exists: 技能「{payload.name}」已存在")
    skill = Skill(user_id=get_or_create_default_user(db).id, **payload.model_dump())
    db.add(skill)
    db.flush()
    db.refresh(skill)
    return skill


def update(db: Session, skill: Skill, payload: SkillPatch) -> Skill:
    """部分更新；改名撞名同样 raise ValueError("skill_name_exists")"""
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != skill.name:
        clash = get_by_name(db, data["name"])
        if clash is not None:
            raise ValueError(f"skill_name_exists: 技能「{data['name']}」已存在")
    for field, value in data.items():
        setattr(skill, field, value)
    db.flush()
    db.refresh(skill)
    return skill


def delete(db: Session, skill: Skill) -> None:
    """删除；project_skills 关联随 FK CASCADE 清理"""
    db.delete(skill)


def count_skills(db: Session) -> int:
    """dashboard asset_progress 用"""
    return db.scalar(select(func.count()).select_from(Skill)) or 0
