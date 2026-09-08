'''
Applications 路由（04 §5.6）：极简投递表格 + 面试题库。

跨字段校验（04 §5.6，路由层）：status ≠ to_apply 而 applied_at 为空 →
422 validation_error + 字段级 details（repo 只管数据，见 applications.py docstring）。

面试题：application_id 提供时后端带出 company/position（04 §5.6，覆盖前端提交值）。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from backend.api.errors import AppError
from backend.api.listing import PageParams, data_list
from backend.database.session import get_db
from backend.repositories import applications as applications_repo
from backend.repositories import interview_qa as interview_qa_repo
from backend.schemas.applications import (ApplicationPatch, ApplicationRead,
                                          ApplicationWrite, InterviewQAPatch,
                                          InterviewQARead, InterviewQAWrite)
from backend.schemas.common import Data, DataList

router = APIRouter(prefix="/api/v1", tags=["Applications"])


def _application_or_404(db: Session, application_id: str):
    application = applications_repo.get(db, application_id)
    if application is None:
        raise AppError(status_code=404, code="not_found", message=f"投递记录 {application_id} 不存在")
    return application


def _validate_applied_at(status, applied_at) -> None:
    """status ≠ to_apply 必须有投递时间（04 §5.6 字段级 422）"""
    if status is not None and status.value != "to_apply" and applied_at is None:
        raise AppError(
            status_code=422, code="validation_error",
            message="状态已非待投递，请补充投递时间",
            details=[{"field": "applied_at", "message": "状态已非待投递，请补充投递时间",
                      "code": "missing"}],
        )


def _app_read(db: Session, application) -> ApplicationRead:
    """行 → Read DTO；resume_version 摘要 JOIN 带出（04 §5.1/§5.6）"""
    return ApplicationRead(
        id=application.id, company=application.company, position=application.position,
        status=application.status, applied_at=application.applied_at,
        resume_version_id=application.resume_version_id, note=application.note,
        created_at=application.created_at,
        resume_version=applications_repo.resume_version_summary(db, application),
    )


# ---------------------------------------------------------------- 投递 CRUD

@router.get("/applications", response_model=DataList[ApplicationRead])
def list_applications(
    request: Request,
    status: Optional[str] = Query(None, description="03 §3.3 深链接：?status=interview,offer 逗号多值"),
    q: Optional[str] = Query(None, description="公司/岗位 ILIKE"),
    sort: Optional[str] = Query(None, description="applied_at | created_at | company，- 前缀倒序"),
    paging: PageParams = Depends(PageParams),
    db: Session = Depends(get_db),
):
    rows, total = applications_repo.list_applications(
        db, page=paging.page, per_page=paging.per_page, status=status, q=q, sort=sort
    )
    items = [_app_read(db, r) for r in rows]
    return data_list(request, items, total, paging.page, paging.per_page)


@router.post("/applications", response_model=Data[ApplicationRead], status_code=201)
def create_application(payload: ApplicationWrite, response: Response, db: Session = Depends(get_db)):
    _validate_applied_at(payload.status, payload.applied_at)
    application = applications_repo.create(db, payload)
    response.headers["Location"] = f"/api/v1/applications/{application.id}"
    return {"data": _app_read(db, application)}


@router.get("/applications/{application_id}", response_model=Data[ApplicationRead])
def get_application(application_id: str, db: Session = Depends(get_db)):
    return {"data": _app_read(db, _application_or_404(db, application_id))}


@router.patch("/applications/{application_id}", response_model=Data[ApplicationRead])
def patch_application(application_id: str, payload: ApplicationPatch, db: Session = Depends(get_db)):
    """状态流转 = PATCH status（任意两态允许）；跨字段校验合并旧值后判断"""
    application = _application_or_404(db, application_id)
    next_status = payload.status if payload.status is not None else application.status
    next_applied_at = payload.applied_at if payload.applied_at is not None else application.applied_at
    _validate_applied_at(next_status, next_applied_at)
    updated = applications_repo.update(db, application, payload)
    return {"data": _app_read(db, updated)}


@router.delete("/applications/{application_id}", status_code=204)
def delete_application(application_id: str, db: Session = Depends(get_db)):
    application = _application_or_404(db, application_id)
    applications_repo.delete(db, application)


# ---------------------------------------------------------------- 面试题库

@router.get("/interview-qa", response_model=Data[List[InterviewQARead]])
def list_interview_qa(company: Optional[str] = Query(None, description="按公司精确过滤"),
                      db: Session = Depends(get_db)):
    return {"data": interview_qa_repo.list_qas(db, company=company)}


@router.post("/interview-qa", response_model=Data[InterviewQARead], status_code=201)
def create_interview_qa(payload: InterviewQAWrite, response: Response, db: Session = Depends(get_db)):
    """录入面试题；application_id 提供时带出 company/position（以后端为准，04 §5.6）"""
    company, position = payload.company, payload.position
    if payload.application_id:
        application = applications_repo.get(db, payload.application_id)
        if application is None:
            raise AppError(status_code=404, code="not_found",
                           message=f"投递记录 {payload.application_id} 不存在")
        company, position = application.company, application.position
    qa = interview_qa_repo.create(db, payload, company=company, position=position)
    response.headers["Location"] = f"/api/v1/interview-qa/{qa.id}"
    return {"data": qa}


def _qa_or_404(db: Session, qa_id: str):
    qa = interview_qa_repo.get(db, qa_id)
    if qa is None:
        raise AppError(status_code=404, code="not_found", message=f"面试题 {qa_id} 不存在")
    return qa


@router.patch("/interview-qa/{qa_id}", response_model=Data[InterviewQARead])
def patch_interview_qa(qa_id: str, payload: InterviewQAPatch, db: Session = Depends(get_db)):
    return {"data": interview_qa_repo.update(db, _qa_or_404(db, qa_id), payload)}


@router.delete("/interview-qa/{qa_id}", status_code=204)
def delete_interview_qa(qa_id: str, db: Session = Depends(get_db)):
    interview_qa_repo.delete(db, _qa_or_404(db, qa_id))
