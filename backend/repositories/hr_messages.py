'''
hr_messages 数据访问（04 §5.5）：生成即保存 + 可编辑，无锁定状态机（04 决定 #6）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import HrMessage
from backend.repositories.users import get_or_create_default_user
from backend.schemas.hr_messages import HRMessagePatch


def list_hr_messages(db: Session, jd_id: Optional[str] = None) -> list[HrMessage]:
    """历史列表（created_at 倒序）；?jd_id= 过滤"""
    stmt = select(HrMessage)
    if jd_id:
        stmt = stmt.where(HrMessage.jd_id == jd_id)
    return list(db.scalars(stmt.order_by(HrMessage.created_at.desc())))


def get(db: Session, message_id: str) -> Optional[HrMessage]:
    return db.get(HrMessage, message_id)


def create(db: Session, *, jd_id: Optional[str], resume_version_id: Optional[str],
           scene: str, mode: str, content: str) -> HrMessage:
    """任务协程落库用：content 为 LLM 生成文案（chunk 流已展示过同一文本）"""
    message = HrMessage(
        user_id=get_or_create_default_user(db).id,
        jd_id=jd_id, resume_version_id=resume_version_id, scene=scene, mode=mode, content=content,
    )
    db.add(message)
    db.flush()
    db.refresh(message)
    return message


def update(db: Session, message: HrMessage, payload: HRMessagePatch) -> HrMessage:
    """编辑文案（Human-in-the-loop 由编辑/重新生成承担）"""
    message.content = payload.content
    db.flush()
    db.refresh(message)
    return message


def delete(db: Session, message: HrMessage) -> None:
    db.delete(message)
