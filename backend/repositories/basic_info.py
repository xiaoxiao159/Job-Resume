'''
basic_info 数据访问（04 §5.2：单例资源，PUT upsert 语义）

- schema 的 BasicInfoWrite 字段与表列同名（snake_case 零映射），
  model_dump() 直接打到 ORM 对象 / 构造参数上，不逐字段搬运
- 提交交给 get_db 依赖（成功 commit / 异常 rollback），这里只 flush 取回 DB 生成的值
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import BasicInfo
from backend.repositories.users import get_or_create_default_user
from backend.schemas.career_assets import BasicInfoWrite


def get_basic_info(db: Session) -> BasicInfo | None:
    """取单例行；未填写返回 None，由路由翻译成 404。"""
    return db.scalars(select(BasicInfo).limit(1)).first()


def upsert_basic_info(db: Session, payload: BasicInfoWrite) -> BasicInfo:
    """有则全量更新、无则创建（04 §5.2 单例 upsert）。返回落库后的行。"""
    info = get_basic_info(db)
    if info is None:
        info = BasicInfo(user_id=get_or_create_default_user(db).id, **payload.model_dump())
        db.add(info)
    else:
        for field, value in payload.model_dump().items():
            setattr(info, field, value)
    db.flush()
    db.refresh(info)  # 取 DB 填充的 id / created_at / updated_at（server_default 生成）
    return info