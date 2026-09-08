'''
project_expressions 数据访问（04 §5.2 / 02 §4.10）：版本留档，无覆盖语义

- 版本号 = 该 (project, type) 组合下 max+1，由应用层计算（02 §4.10）
- 取用规则：优先最新 confirmed；无 confirmed 取最新草稿（version_number 最大）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.database.models import ExpressionStatus, ExpressionType, ProjectExpression
from backend.schemas.career_assets import ProjectExpressionUpdate


def list_for_project(db: Session, project_id: str, expr_type: Optional[ExpressionType] = None) -> list[ProjectExpression]:
    """版本列表（version_number 倒序 = 最新在前）；?type= 过滤"""
    stmt = select(ProjectExpression).where(ProjectExpression.project_id == project_id)
    if expr_type is not None:
        stmt = stmt.where(ProjectExpression.type == expr_type)
    return list(db.scalars(stmt.order_by(ProjectExpression.version_number.desc())))


def get(db: Session, expression_id: str) -> Optional[ProjectExpression]:
    return db.get(ProjectExpression, expression_id)


def next_version_number(db: Session, project_id: str, expr_type: ExpressionType) -> int:
    """该组合当前最大版本号 + 1（无历史从 1 起）"""
    current = db.scalar(
        select(func.max(ProjectExpression.version_number)).where(
            ProjectExpression.project_id == project_id,
            ProjectExpression.type == expr_type,
        )
    )
    return (current or 0) + 1


def create(db: Session, *, project_id: str, expr_type: ExpressionType,
           version_number: int, content: dict) -> ProjectExpression:
    """任务协程落库用：status 默认 draft（Human-in-the-loop 由 PATCH confirm 承担）"""
    expression = ProjectExpression(
        project_id=project_id, type=expr_type, version_number=version_number,
        content=content,
    )
    db.add(expression)
    db.flush()
    db.refresh(expression)
    return expression


def update(db: Session, expression: ProjectExpression, payload: ProjectExpressionUpdate) -> ProjectExpression:
    """PATCH：确认（status=confirmed）或编辑内容（content 整体替换），可同时带上"""
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(expression, field, value)
    db.flush()
    db.refresh(expression)
    return expression


def latest_confirmed(db: Session, project_id: str, expr_type: ExpressionType) -> Optional[ProjectExpression]:
    """最新 confirmed 表达（02 §4.10 取用规则；resume_generate 风格基线用）"""
    return db.scalars(
        select(ProjectExpression)
        .where(
            ProjectExpression.project_id == project_id,
            ProjectExpression.type == expr_type,
            ProjectExpression.status == ExpressionStatus.confirmed,
        )
        .order_by(ProjectExpression.version_number.desc())
        .limit(1)
    ).first()
