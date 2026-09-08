'''
JD Analysis 路由（04 §5.3）：job-descriptions CRUD + analyze 任务触发 + analysis 读取

analyze 触发链路（04 §3.1 统一任务协议）：
冲突预检（内存运行集，409 task_running）→ analysis 置 processing（前端骨架屏）
→ 建 agent_runs 行 → 提交 → 202；任务协程在事件循环执行，SSE 走 /agent-runs/{id}/events。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from backend.api.errors import AppError
from backend.api.listing import PageParams, data_list
from backend.database.models import AnalysisStatus
from backend.database.session import get_db
from backend.repositories import agent_runs as agent_runs_repo
from backend.repositories import jd_analyses as jd_analyses_repo
from backend.repositories import jd_matches as jd_matches_repo
from backend.repositories import job_descriptions as jd_repo
from backend.schemas.common import Data, DataList, StartAgentTaskData
from backend.schemas.jd_analysis import (JDAnalysisRead, JDMatchRead,
                                         JobDescriptionPatch,
                                         JobDescriptionRead,
                                         JobDescriptionWrite)
from backend.services.agent_tasks.manager import manager
from backend.services.agent_tasks.registry import get_task

router = APIRouter(prefix="/api/v1", tags=["JD Analysis"])


def _jd_or_404(db: Session, jd_id: str):
    jd = jd_repo.get(db, jd_id)
    if jd is None:
        raise AppError(status_code=404, code="not_found", message=f"JD {jd_id} 不存在")
    return jd


def _jd_read(db: Session, jd) -> JobDescriptionRead:
    """JD 行 → Read DTO；latest_match_score 由 repo 查询带出（07 §15 契约差异 #5）"""
    return JobDescriptionRead(
        id=jd.id, title=jd.title, company=jd.company, raw_text=jd.raw_text,
        created_at=jd.created_at,
        latest_match_score=jd_repo.latest_match_score(db, jd.id),
    )


# ---------------------------------------------------------------- CRUD

@router.post("/job-descriptions", response_model=Data[JobDescriptionRead], status_code=201)
def create_jd(payload: JobDescriptionWrite, response: Response, db: Session = Depends(get_db)):
    """创建 JD（04 §2.4：201 + Location 头）"""
    jd = jd_repo.create(db, payload)
    response.headers["Location"] = f"/api/v1/job-descriptions/{jd.id}"
    return {"data": _jd_read(db, jd)}


@router.get("/job-descriptions", response_model=DataList[JobDescriptionRead])
def list_jds(
    request: Request,
    q: Optional[str] = Query(None, description="04 §2.3：标题/公司 ILIKE 搜索"),
    sort: Optional[str] = Query(None, description="04 §2.3：?sort=-created_at"),
    paging: PageParams = Depends(PageParams),
    db: Session = Depends(get_db),
):
    rows, scores, total = jd_repo.list_jds(db, page=paging.page, per_page=paging.per_page, q=q, sort=sort)
    items = [
        JobDescriptionRead(
            id=r.id, title=r.title, company=r.company, raw_text=r.raw_text,
            created_at=r.created_at,
            latest_match_score=float(score) if score is not None else None,
        )
        for r, score in zip(rows, scores)
    ]
    return data_list(request, items, total, paging.page, paging.per_page)


@router.get("/job-descriptions/{jd_id}", response_model=Data[JobDescriptionRead])
def get_jd(jd_id: str, db: Session = Depends(get_db)):
    jd = _jd_or_404(db, jd_id)
    return {"data": _jd_read(db, jd)}


@router.patch("/job-descriptions/{jd_id}", response_model=Data[JobDescriptionRead])
def patch_jd(jd_id: str, payload: JobDescriptionPatch, db: Session = Depends(get_db)):
    jd = _jd_or_404(db, jd_id)
    updated = jd_repo.update(db, jd, payload)
    return {"data": _jd_read(db, updated)}


@router.delete("/job-descriptions/{jd_id}", status_code=204)
def delete_jd(jd_id: str, db: Session = Depends(get_db)):
    jd = _jd_or_404(db, jd_id)
    jd_repo.delete(db, jd)


# ---------------------------------------------------------------- analyze / analysis

@router.post("/job-descriptions/{jd_id}/analyze", response_model=Data[StartAgentTaskData], status_code=202)
def analyze_jd(jd_id: str, db: Session = Depends(get_db)):
    """触发 JD 分析（04 §3.1）：202 + agent_run_id；SSE 订阅 /agent-runs/{id}/events"""
    _jd_or_404(db, jd_id)

    task_def = get_task("jd_analyze")
    params = {"jd_id": jd_id}
    if manager.is_reserved(task_def.conflict_key(params)):
        raise AppError(status_code=409, code="task_running", message="该 JD 已有进行中的分析任务")

    jd_analyses_repo.mark_processing(db, jd_id)   # GET analysis 返回 processing（骨架屏）
    run = agent_runs_repo.create(
        db, agent_type=task_def.agent_type, prompt_name=task_def.prompt_name,
        input_refs={"jd_id": jd_id},
    )
    manager.submit(run.id, task_def.prompt_name, params, {"jd_id": jd_id})
    return {"data": {"agent_run_id": run.id, "status": "running"}}


@router.get("/job-descriptions/{jd_id}/analysis", response_model=Data[Optional[JDAnalysisRead]])
def get_analysis(jd_id: str, db: Session = Depends(get_db)):
    """岗位画像（04 §5.3）；无分析行返回 {"data": null}——前端契约（07 §15 差异 #4）"""
    _jd_or_404(db, jd_id)
    analysis = jd_analyses_repo.get_for_jd(db, jd_id)
    # ORM 行非 dict：from_attributes 显式开启（pydantic v2 model_validate）
    read = JDAnalysisRead.model_validate(analysis, from_attributes=True) if analysis is not None else None
    return {"data": read}


# ---------------------------------------------------------------- match / matches（04 §5.3）

@router.post("/job-descriptions/{jd_id}/matches", response_model=Data[StartAgentTaskData], status_code=202)
def run_match(jd_id: str, db: Session = Depends(get_db)):
    """触发 JD 匹配（202）：输入依赖岗位画像，画像缺失/未完成 → 409 analysis_not_ready"""
    _jd_or_404(db, jd_id)
    analysis = jd_analyses_repo.get_for_jd(db, jd_id)
    if analysis is None or analysis.status != AnalysisStatus.completed:
        raise AppError(status_code=409, code="analysis_not_ready", message="请先完成岗位分析，再运行匹配")

    task_def = get_task("jd_match")
    params = {"jd_id": jd_id}
    if manager.is_reserved(task_def.conflict_key(params)):
        raise AppError(status_code=409, code="task_running", message="该 JD 已有进行中的匹配任务")
    run = agent_runs_repo.create(
        db, agent_type=task_def.agent_type, prompt_name=task_def.prompt_name,
        input_refs={"jd_id": jd_id},
    )
    manager.submit(run.id, task_def.prompt_name, params, {"jd_id": jd_id})
    return {"data": {"agent_run_id": run.id, "status": "running"}}


@router.get("/job-descriptions/{jd_id}/matches", response_model=Data[List[JDMatchRead]])
def list_matches(jd_id: str, db: Session = Depends(get_db)):
    """匹配历史（1:N 留档，created_at 倒序 = 最新在前）"""
    _jd_or_404(db, jd_id)
    return {"data": jd_matches_repo.list_for_jd(db, jd_id)}