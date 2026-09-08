import os
from contextlib import asynccontextmanager
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.api.agent_runs import router as agent_runs_router
from backend.api.applications import router as applications_router
from backend.api.career_assets import router as career_assets_router
from backend.api.dashboard import router as dashboard_router
from backend.api.errors import AppError
from backend.api.hr_messages import router as hr_messages_router
from backend.api.jd_analysis import router as jd_analysis_router
from backend.api.projects import router as projects_router
from backend.api.resumes import router as resumes_router
from backend.database.session import init_db
from backend.schemas.common import ErrorBody, ErrorDetail, ErrorEnvelope
from backend.services.agent_tasks.manager import manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动：建表（create_all 幂等：只创建不存在的表）+ Agent 任务管理器绑定事件循环
    init_db()
    manager.start()
    yield
    # 退出：停后台循环（watchdog / 缓冲清理），不打断进行中任务的收尾由进程退出兜底
    await manager.shutdown()


app = FastAPI(lifespan=lifespan)

app.include_router(career_assets_router)
app.include_router(projects_router)
app.include_router(jd_analysis_router)
app.include_router(resumes_router)
app.include_router(hr_messages_router)
app.include_router(applications_router)
app.include_router(dashboard_router)
app.include_router(agent_runs_router)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    """业务错误 → 04 §2.2 统一错误 envelope；details 仅跨字段 422 时携带"""
    details = [ErrorDetail(**d) for d in exc.details] if exc.details else None
    body = ErrorEnvelope(error=ErrorBody(code=exc.code, message=str(exc.detail), details=details))
    return JSONResponse(status_code=exc.status_code, content=body.model_dump(mode="json"))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """422 校验失败 → 错误 envelope + 字段级 details（04 §6 validation_error）"""
    details = [
        ErrorDetail(
            field=".".join(str(part) for part in err["loc"] if part != "body") or "body",
            message=err["msg"],
            code=err["type"],
        )
        for err in exc.errors()
    ]
    body = ErrorEnvelope(
        error=ErrorBody(code="validation_error", message="Request validation failed", details=details)
    )
    return JSONResponse(status_code=422, content=body.model_dump(mode="json"))


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}