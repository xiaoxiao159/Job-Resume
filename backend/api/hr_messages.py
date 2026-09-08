'''
HR Messages 路由（04 §5.5）：生成即保存、可编辑、无锁定状态机。

生成走统一任务协议（202）；冲突键按 (jd_id, scene) 维度——无 JD 的通用
打招呼不设冲突键（可并行生成多条）。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.api.errors import AppError
from backend.database.session import get_db
from backend.repositories import agent_runs as agent_runs_repo
from backend.repositories import hr_messages as hr_messages_repo
from backend.repositories import job_descriptions as jd_repo
from backend.repositories import resume_versions as versions_repo
from backend.schemas.common import Data, StartAgentTaskData
from backend.schemas.hr_messages import (HRMessageGenerate, HRMessagePatch,
                                         HRMessageRead)
from backend.services.agent_tasks.manager import manager
from backend.services.agent_tasks.registry import get_task

router = APIRouter(prefix="/api/v1", tags=["HR Messages"])


def _message_or_404(db: Session, message_id: str):
    message = hr_messages_repo.get(db, message_id)
    if message is None:
        raise AppError(status_code=404, code="not_found", message=f"HR 消息 {message_id} 不存在")
    return message


@router.get("/hr-messages", response_model=Data[List[HRMessageRead]])
def list_hr_messages(jd_id: Optional[str] = Query(None, description="按 JD 过滤，缺省全部"),
                     db: Session = Depends(get_db)):
    return {"data": hr_messages_repo.list_hr_messages(db, jd_id=jd_id)}


@router.post("/hr-messages", response_model=Data[StartAgentTaskData], status_code=202)
def generate_hr_message(payload: HRMessageGenerate, db: Session = Depends(get_db)):
    """生成打招呼文案（202）：完成后任务协程落库，done.refs.hr_message_id 指向新行"""
    if payload.jd_id and jd_repo.get(db, payload.jd_id) is None:
        raise AppError(status_code=404, code="not_found", message=f"JD {payload.jd_id} 不存在")
    if payload.resume_version_id and versions_repo.get(db, payload.resume_version_id) is None:
        raise AppError(status_code=404, code="not_found",
                       message=f"简历版本 {payload.resume_version_id} 不存在")

    task_def = get_task("hr_message")
    params = {
        "jd_id": payload.jd_id,
        "resume_version_id": payload.resume_version_id,
        "scene": payload.scene.value,
        "mode": payload.mode.value,
    }
    conflict_key = task_def.conflict_key(params) if task_def.conflict_key else None
    if conflict_key is not None and manager.is_reserved(conflict_key):
        raise AppError(status_code=409, code="task_running", message="该场景已有进行中的文案生成任务")

    run = agent_runs_repo.create(
        db, agent_type=task_def.agent_type, prompt_name=task_def.prompt_name,
        input_refs={"jd_id": payload.jd_id, "resume_version_id": payload.resume_version_id},
    )
    manager.submit(run.id, task_def.prompt_name, params,
                   {"jd_id": payload.jd_id, "resume_version_id": payload.resume_version_id})
    return {"data": {"agent_run_id": run.id, "status": "running"}}


@router.get("/hr-messages/{message_id}", response_model=Data[HRMessageRead])
def get_hr_message(message_id: str, db: Session = Depends(get_db)):
    return {"data": _message_or_404(db, message_id)}


@router.patch("/hr-messages/{message_id}", response_model=Data[HRMessageRead])
def patch_hr_message(message_id: str, payload: HRMessagePatch, db: Session = Depends(get_db)):
    """人工润色后保存（生成即保存、可编辑，无锁定）"""
    message = _message_or_404(db, message_id)
    return {"data": hr_messages_repo.update(db, message, payload)}


@router.delete("/hr-messages/{message_id}", status_code=204)
def delete_hr_message(message_id: str, db: Session = Depends(get_db)):
    message = _message_or_404(db, message_id)
    hr_messages_repo.delete(db, message)
