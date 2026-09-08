'''
Agent Runs 路由（04 §3.3 / §3.2）：

- GET /agent-runs                     任务日志列表（?agent_type=&status=，分页）
- GET /agent-runs/{id}                详情（前端「先查后听」恢复用）
- GET /agent-runs/{id}/events         SSE 订阅：-> 缓冲重放 -> 实时续传 -> 终态关闭
- POST /agent-runs/{id}/cancel        尽力而为取消（04 §3.2）
- POST /agent-runs/{id}/feedback      预留：待 02 v0.4 补 feedback 列后启用（05 待确认 #4）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend.api.errors import AppError
from backend.api.listing import PageParams, data_list
from backend.database.models import AgentRunStatus
from backend.database.session import get_db
from backend.repositories import agent_runs as agent_runs_repo
from backend.schemas.agent_runs import AgentRunRead
from backend.schemas.common import Data, DataList
from backend.services.agent_tasks.manager import manager

router = APIRouter(prefix="/api/v1", tags=["Agent Runs"])


@router.get("/agent-runs", response_model=DataList[AgentRunRead])
def list_agent_runs(
    request: Request,
    agent_type: Optional[str] = Query(None, description="04 §3.3：agent_type 或 prompt_name"),
    status: Optional[Literal["running", "completed", "failed"]] = Query(None),
    paging: PageParams = Depends(PageParams),
    db: Session = Depends(get_db),
):
    rows, total = agent_runs_repo.list_runs(
        db, page=paging.page, per_page=paging.per_page,
        agent_type=agent_type, status=AgentRunStatus(status) if status else None,
    )
    return data_list(request, [AgentRunRead.from_row(r) for r in rows], total, paging.page, paging.per_page)


@router.get("/agent-runs/{run_id}", response_model=Data[AgentRunRead])
def get_agent_run(run_id: str, db: Session = Depends(get_db)):
    run = agent_runs_repo.get(db, run_id)
    if run is None:
        raise AppError(status_code=404, code="not_found", message=f"任务 {run_id} 不存在")
    return {"data": AgentRunRead.from_row(run)}


@router.get("/agent-runs/{run_id}/events")
async def agent_run_events(run_id: str, db: Session = Depends(get_db)):
    """SSE 订阅（04 §3.2）：先查状态——运行中缓冲为空说明重启丢缓冲（404）；已完成但缓冲被清（24h+）同样 404"""
    run = await run_in_threadpool(agent_runs_repo.get, db, run_id)
    if run is None:
        raise AppError(status_code=404, code="not_found", message=f"任务 {run_id} 不存在")
    return StreamingResponse(
        manager.subscribe(run_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/agent-runs/{run_id}/cancel")
def cancel_agent_run(run_id: str, db: Session = Depends(get_db)):
    """取消任务（尽力而为，04 §3.2）：置旗标后由任务管线在最近检查点中断"""
    run = agent_runs_repo.get(db, run_id)
    if run is None:
        raise AppError(status_code=404, code="not_found", message=f"任务 {run_id} 不存在")
    manager.cancel(run_id)
    return {"data": {"status": "cancelling"}}


class FeedbackRequest(BaseModel):
    """👍/👎 反馈体（03 §4.1）：up / down，重复提交覆盖"""
    feedback: Literal["up", "down"]


@router.post("/agent-runs/{run_id}/feedback")
def send_feedback(run_id: str, payload: FeedbackRequest, db: Session = Depends(get_db)):
    """任务反馈（03 §4.1 / 02 v0.4 feedback 列）：覆盖式写入，响应 {"data": null}"""
    if agent_runs_repo.get(db, run_id) is None:
        raise AppError(status_code=404, code="not_found", message=f"任务 {run_id} 不存在")
    agent_runs_repo.set_feedback(db, run_id, payload.feedback)
    return {"data": None}