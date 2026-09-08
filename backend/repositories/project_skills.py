'''
project_skills 关联数据访问（04 §5.2）：

- GET /projects/{id}/skills：关联技能列表（含 proficiency，前端 ProjectSkill 契约）
- PUT /projects/{id}/skills：整体替换（04 决策 #7 批量端点语义）——先删后建，
  单请求事务由 get_db 承担（成功 commit / 异常 rollback，无中间态暴露）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.database.models import ProjectSkill, Skill


def list_skills_of(db: Session, project_id: str) -> list[Skill]:
    """项目关联技能，按 skills.sort_order 展示"""
    return list(db.scalars(
        select(Skill)
        .join(ProjectSkill, ProjectSkill.skill_id == Skill.id)
        .where(ProjectSkill.project_id == project_id)
        .order_by(Skill.sort_order, Skill.created_at)
    ))


def replace(db: Session, project_id: str, skill_ids: list[str]) -> None:
    """批量替换关联：skill_ids 为该项目关联的完整列表（空 = 清空）。

    未知 skill_id → ValueError("not_found")，路由翻译 404；
    重复 id 先去重（幂等）。
    """
    unique_ids = list(dict.fromkeys(skill_ids))   # 保序去重
    rows = {s.id for s in db.scalars(select(Skill).where(Skill.id.in_(unique_ids)))} if unique_ids else set()
    unknown = [i for i in unique_ids if i not in rows]
    if unknown:
        raise ValueError(f"not_found: 技能 {unknown[0]} 不存在")
    db.execute(delete(ProjectSkill).where(ProjectSkill.project_id == project_id))
    for skill_id in unique_ids:
        db.add(ProjectSkill(project_id=project_id, skill_id=skill_id))
    db.flush()
