'''
evidence 数据访问（04 §5.2）：挂在项目上的证据（PRD §3.1 Evidence First）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import Evidence
from backend.schemas.career_assets import EvidencePatch, EvidenceWrite


def list_for_project(db: Session, project_id: str) -> list[Evidence]:
    """项目证据列表（created_at 升序 = 录入顺序）"""
    return list(db.scalars(
        select(Evidence).where(Evidence.project_id == project_id).order_by(Evidence.created_at)
    ))


def get(db: Session, evidence_id: str) -> Evidence | None:
    return db.get(Evidence, evidence_id)


def create(db: Session, project_id: str, payload: EvidenceWrite) -> Evidence:
    evidence = Evidence(project_id=project_id, **payload.model_dump())
    db.add(evidence)
    db.flush()
    db.refresh(evidence)
    return evidence


def update(db: Session, evidence: Evidence, payload: EvidencePatch) -> Evidence:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(evidence, field, value)
    db.flush()
    db.refresh(evidence)
    return evidence


def delete(db: Session, evidence: Evidence) -> None:
    db.delete(evidence)
