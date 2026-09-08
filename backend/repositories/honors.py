'''
honors 数据访问（04 §5.2）：荣誉证书（同构三件套之三，时间为自由文本 02 §4.9）

排序/校验约定与 educations.py 一致，见该文件 docstring。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import Honor
from backend.repositories.users import get_or_create_default_user
from backend.schemas.career_assets import HonorPatch, HonorWrite


def list_honors(db: Session) -> list[Honor]:
    """全量列表，按 sort_order 升序"""
    return list(db.scalars(select(Honor).order_by(Honor.sort_order, Honor.created_at)))


def get(db: Session, honor_id: str) -> Honor | None:
    return db.get(Honor, honor_id)


def create(db: Session, payload: HonorWrite) -> Honor:
    honor = Honor(user_id=get_or_create_default_user(db).id, **payload.model_dump())
    db.add(honor)
    db.flush()
    db.refresh(honor)
    return honor


def update(db: Session, honor: Honor, payload: HonorPatch) -> Honor:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(honor, field, value)
    db.flush()
    db.refresh(honor)
    return honor


def delete(db: Session, honor: Honor) -> None:
    db.delete(honor)


def reorder(db: Session, ids: list[str]) -> None:
    """批量重排：ids 顺序即新 sort_order（0 起）"""
    rows = {r.id: r for r in list_honors(db)}
    unknown = [i for i in ids if i not in rows]
    if unknown:
        raise ValueError(f"not_found: 荣誉记录 {unknown[0]} 不存在")
    if set(ids) != set(rows):
        raise ValueError("incomplete: ids 须覆盖全部荣誉记录")
    for index, row_id in enumerate(ids):
        rows[row_id].sort_order = index
    db.flush()
