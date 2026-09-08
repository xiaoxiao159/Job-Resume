'''
interview_qa 数据访问（04 §5.6）：面试问题记录，冗余 company/position 支持按公司分组（02 决策 #11）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import InterviewQA
from backend.repositories.users import get_or_create_default_user
from backend.schemas.applications import InterviewQAPatch, InterviewQAWrite


def list_qas(db: Session, company: Optional[str] = None) -> list[InterviewQA]:
    """列表（created_at 倒序）；?company= 精确过滤（04 §5.6）"""
    stmt = select(InterviewQA)
    if company:
        stmt = stmt.where(InterviewQA.company == company)
    return list(db.scalars(stmt.order_by(InterviewQA.created_at.desc())))


def get(db: Session, qa_id: str) -> Optional[InterviewQA]:
    return db.get(InterviewQA, qa_id)


def create(db: Session, payload: InterviewQAWrite, *, company: str, position: Optional[str]) -> InterviewQA:
    """创建；company/position 为路由层裁决后的最终值——
    application_id 提供时由投递记录带出（04 §5.6，忽略 body 冲突值）"""
    data = payload.model_dump(exclude={"company", "position"})
    qa = InterviewQA(user_id=get_or_create_default_user(db).id, company=company, position=position, **data)
    db.add(qa)
    db.flush()
    db.refresh(qa)
    return qa


def update(db: Session, qa: InterviewQA, payload: InterviewQAPatch) -> InterviewQA:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(qa, field, value)
    db.flush()
    db.refresh(qa)
    return qa


def delete(db: Session, qa: InterviewQA) -> None:
    db.delete(qa)
