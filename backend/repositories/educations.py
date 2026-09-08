'''
educations 数据访问（04 §5.2）：同构资产表三件套之一

- 列表按 sort_order 升序（简历展示顺序）；reorder = 批量写 sort_order（04 决策 #7）
- reorder 校验：未知 id → ValueError("not_found")；ids 未覆盖全部行 → ValueError("incomplete")
  （04 §5.2「须包含该资源全部 id」），路由层翻译为 404 / 422
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import Education
from backend.repositories.users import get_or_create_default_user
from backend.schemas.career_assets import EducationPatch, EducationWrite


def list_educations(db: Session) -> list[Education]:
    """全量列表（单用户数据集小，不分页——前端 apiGet 契约），按 sort_order 升序"""
    return list(db.scalars(select(Education).order_by(Education.sort_order, Education.created_at)))


def get(db: Session, education_id: str) -> Education | None:
    return db.get(Education, education_id)


def create(db: Session, payload: EducationWrite) -> Education:
    education = Education(user_id=get_or_create_default_user(db).id, **payload.model_dump())
    db.add(education)
    db.flush()
    db.refresh(education)
    return education


def update(db: Session, education: Education, payload: EducationPatch) -> Education:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(education, field, value)
    db.flush()
    db.refresh(education)
    return education


def delete(db: Session, education: Education) -> None:
    db.delete(education)


def reorder(db: Session, ids: list[str]) -> None:
    """批量重排：ids 顺序即新 sort_order（0 起）"""
    rows = {r.id: r for r in list_educations(db)}
    unknown = [i for i in ids if i not in rows]
    if unknown:
        raise ValueError(f"not_found: 教育记录 {unknown[0]} 不存在")
    if set(ids) != set(rows):
        raise ValueError("incomplete: ids 须覆盖全部教育记录")
    for index, row_id in enumerate(ids):
        rows[row_id].sort_order = index
    db.flush()
