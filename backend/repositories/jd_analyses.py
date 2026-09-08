'''
jd_analyses 数据访问（04 §5.3：与 JD 1:1，异步分析写入；前端 getAnalysis 无行时返回 null）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import AnalysisStatus, JDAnalysis


def get_for_jd(db: Session, jd_id: str) -> Optional[JDAnalysis]:
    return db.scalars(select(JDAnalysis).where(JDAnalysis.jd_id == jd_id)).first()


def mark_processing(db: Session, jd_id: str) -> JDAnalysis:
    '''触发分析：analysis 行置处理中（04 §5.3 骨架屏语义）；历史内容保留，LLM 完成后覆盖'''
    analysis = get_for_jd(db, jd_id)
    if analysis is None:
        analysis = JDAnalysis(jd_id=jd_id, status=AnalysisStatus.processing)
        db.add(analysis)
    else:
        analysis.status = AnalysisStatus.processing
        analysis.error = None
    db.flush()
    db.refresh(analysis)
    return analysis