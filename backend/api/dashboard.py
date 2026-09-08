'''
Dashboard 路由（04 §5.1）：工作台首页聚合（stats / asset_progress / recent_applications）
单端点一次取回，前端 react-query 整体缓存。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.applications import _app_read
from backend.database.session import get_db
from backend.repositories import dashboard as dashboard_repo
from backend.schemas.applications import DashboardData
from backend.schemas.common import Data

router = APIRouter(prefix="/api/v1", tags=["Dashboard"])


@router.get("/dashboard", response_model=Data[DashboardData])
def get_dashboard(db: Session = Depends(get_db)):
    """工作台聚合数据；recent_applications 携带简历版本摘要（_app_read 复用）"""
    recent = dashboard_repo.recent_applications(db, limit=5)
    return {"data": DashboardData(
        stats=dashboard_repo.get_stats(db),
        asset_progress=dashboard_repo.get_asset_progress(db),
        recent_applications=[_app_read(db, a) for a in recent],
    )}
