'''
resume_versions 数据访问（04 §5.4 / 02 §4.15）：版本状态机落点

- PATCH content 仅 pending：confirmed_at 非空（定稿）→ ValueError("locked_version") → 409
- reflect 由任务协程写 reflection_result / reflection_status；confirm 落 confirmed_at
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.database.models import ResumeVersion
from backend.schemas.resumes import ResumeVersionPatch


def list_for_resume(db: Session, resume_id: str) -> list[ResumeVersion]:
    """版本列表（version_number 倒序 = 最新在前，前端 mock 同语义）"""
    return list(db.scalars(
        select(ResumeVersion).where(ResumeVersion.resume_id == resume_id)
        .order_by(ResumeVersion.version_number.desc())
    ))


def get(db: Session, version_id: str) -> Optional[ResumeVersion]:
    return db.get(ResumeVersion, version_id)


def next_version_number(db: Session, resume_id: str) -> int:
    """该简历当前最大版本号 + 1（无历史从 1 起）"""
    current = db.scalar(
        select(func.max(ResumeVersion.version_number)).where(ResumeVersion.resume_id == resume_id)
    )
    return (current or 0) + 1


def create(db: Session, *, resume_id: str, version_number: int, jd_id: Optional[str],
           content: dict) -> ResumeVersion:
    """任务协程落库用：content 为 assembler 组装好的 8 段快照，状态默认 pending"""
    version = ResumeVersion(
        resume_id=resume_id, version_number=version_number, jd_id=jd_id, content=content,
    )
    db.add(version)
    db.flush()
    db.refresh(version)
    return version


def update_content(db: Session, version: ResumeVersion, payload: ResumeVersionPatch) -> ResumeVersion:
    """Studio 编辑（仅 pending，04 §5.4）：定稿后 raise ValueError("locked_version") → 路由 409"""
    if version.confirmed_at is not None:
        raise ValueError("locked_version: 定稿版本不可编辑")
    version.content = payload.content
    db.flush()
    db.refresh(version)
    return version


def confirm(db: Session, version: ResumeVersion) -> ResumeVersion:
    """定稿：confirmed_at 落时间（DB 时钟）。issues 状态也放行——
    前端二次确认承担（04 §5.4「issues 状态 confirm → 提示仍可定稿」）"""
    version.confirmed_at = func.now()
    db.flush()
    db.refresh(version)
    return version


def apply_reflection(db: Session, version: ResumeVersion, *, status, result: dict) -> ResumeVersion:
    """回填 Reflection 结果（02 §6.5）：reflection 任务协程 / confirm 同步程序检查共用"""
    version.reflection_status = status
    version.reflection_result = result
    db.flush()
    db.refresh(version)
    return version
