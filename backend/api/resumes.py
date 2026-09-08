'''
Resumes 路由（04 §5.4）：简历 CRUD + 版本状态机（generate / regenerate / reflect / confirm）
+ 后端统一渲染（preview / export，§10.4）。

版本状态机（02 决策 #5）：
- generate（POST /resumes/{id}/versions，202）：jd_id 空 = Master 版
- regenerate（POST /resume-versions/{id}/regenerate，202）：新版本号新行，当前版本不动
- reflect（POST /resume-versions/{id}/reflect，202）：真实性/覆盖度校验，结果回填当前版本
- confirm（POST /resume-versions/{id}/confirm，200）：定稿锁定；未 reflect 时按
  前端 mock 契约直接判 passed（04：reflection 由确定性判定兜底）

渲染端点不走 envelope（04 §10.4）：
- preview：text/markdown 或 text/html 裸响应
- export：attachment 下载，filename 用 ASCII 回落 + filename* RFC 5987 编码中文
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List, Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from backend.api.errors import AppError
from backend.api.listing import PageParams, data_list
from backend.database.models import ReflectionStatus
from backend.database.session import get_db
from backend.repositories import agent_runs as agent_runs_repo
from backend.repositories import job_descriptions as jd_repo
from backend.repositories import resumes as resumes_repo
from backend.repositories import resume_versions as versions_repo
from backend.schemas.common import Data, DataList, StartAgentTaskData
from backend.schemas.resumes import (RegenerateRequest, ResumePatch, ResumeRead,
                                     ResumeVersionPatch, ResumeVersionRead,
                                     ResumeWrite, VersionConfirmData,
                                     VersionGenerateRequest)
from backend.services import reflection_checks, rendering
from backend.services.agent_tasks.manager import manager
from backend.services.agent_tasks.registry import get_task

router = APIRouter(prefix="/api/v1", tags=["Resumes"])


def _resume_or_404(db: Session, resume_id: str):
    resume = resumes_repo.get(db, resume_id)
    if resume is None:
        raise AppError(status_code=404, code="not_found", message=f"简历 {resume_id} 不存在")
    return resume


def _version_or_404(db: Session, version_id: str):
    version = versions_repo.get(db, version_id)
    if version is None:
        raise AppError(status_code=404, code="not_found", message=f"简历版本 {version_id} 不存在")
    return version


def _start_task(db: Session, prompt_name: str, params: dict, input_refs: dict,
                conflict_message: str) -> dict:
    """任务触发样板（jd_analysis.analyze_jd 同款）"""
    task_def = get_task(prompt_name)
    conflict_key = task_def.conflict_key(params) if task_def.conflict_key else None
    if conflict_key is not None and manager.is_reserved(conflict_key):
        raise AppError(status_code=409, code="task_running", message=conflict_message)
    run = agent_runs_repo.create(
        db, agent_type=task_def.agent_type, prompt_name=task_def.prompt_name, input_refs=input_refs,
    )
    manager.submit(run.id, task_def.prompt_name, params, input_refs)
    return {"agent_run_id": run.id, "status": "running"}


# ---------------------------------------------------------------- 简历 CRUD

@router.get("/resumes", response_model=DataList[ResumeRead])
def list_resumes(request: Request, paging: PageParams = Depends(PageParams), db: Session = Depends(get_db)):
    """简历列表（DataList 契约）；行数少，全量取回后内存分页"""
    rows = resumes_repo.list_resumes(db)
    total = len(rows)
    start = (paging.page - 1) * paging.per_page
    return data_list(request, rows[start:start + paging.per_page], total, paging.page, paging.per_page)


@router.post("/resumes", response_model=Data[ResumeRead], status_code=201)
def create_resume(payload: ResumeWrite, response: Response, db: Session = Depends(get_db)):
    """创建简历；同 target_role 重复创建 409 target_role_exists（04 §6）"""
    try:
        resume = resumes_repo.create(db, payload)
    except ValueError as exc:
        raise AppError(status_code=409, code="target_role_exists",
                       message=str(exc).split(":", 1)[1].strip()) from exc
    response.headers["Location"] = f"/api/v1/resumes/{resume.id}"
    return {"data": resume}


@router.get("/resumes/{resume_id}", response_model=Data[ResumeRead])
def get_resume(resume_id: str, db: Session = Depends(get_db)):
    return {"data": _resume_or_404(db, resume_id)}


@router.patch("/resumes/{resume_id}", response_model=Data[ResumeRead])
def patch_resume(resume_id: str, payload: ResumePatch, db: Session = Depends(get_db)):
    """改 title / template（04 §5.4：模板选择在简历维度）"""
    resume = _resume_or_404(db, resume_id)
    return {"data": resumes_repo.update(db, resume, payload)}


@router.delete("/resumes/{resume_id}", status_code=204)
def delete_resume(resume_id: str, db: Session = Depends(get_db)):
    resume = _resume_or_404(db, resume_id)
    resumes_repo.delete(db, resume)


# ---------------------------------------------------------------- 版本：生成与读取

@router.get("/resumes/{resume_id}/versions", response_model=Data[List[ResumeVersionRead]])
def list_versions(resume_id: str, db: Session = Depends(get_db)):
    """版本列表（version_number 倒序 = 最新在前）"""
    _resume_or_404(db, resume_id)
    return {"data": versions_repo.list_for_resume(db, resume_id)}


@router.post("/resumes/{resume_id}/versions", response_model=Data[StartAgentTaskData], status_code=202)
def generate_version(resume_id: str, payload: VersionGenerateRequest, db: Session = Depends(get_db)):
    """生成版本（202）：jd_id 空 = Master 版（资产直取）；有 jd = 定制版（LLM 认知段）"""
    _resume_or_404(db, resume_id)
    if payload.jd_id and jd_repo.get(db, payload.jd_id) is None:
        raise AppError(status_code=404, code="not_found", message=f"JD {payload.jd_id} 不存在")

    params = {"resume_id": resume_id, "jd_id": payload.jd_id, "instruction": payload.instruction}
    data = _start_task(db, "resume_generate", params,
                       {"resume_id": resume_id, "jd_id": payload.jd_id},
                       "该简历已有进行中的生成任务")
    return {"data": data}


@router.get("/resume-versions/{version_id}", response_model=Data[ResumeVersionRead])
def get_version(version_id: str, db: Session = Depends(get_db)):
    return {"data": _version_or_404(db, version_id)}


@router.patch("/resume-versions/{version_id}", response_model=Data[ResumeVersionRead])
def patch_version(version_id: str, payload: ResumeVersionPatch, db: Session = Depends(get_db)):
    """编辑 8 段快照（整体替换）；仅 pending 可编辑，定稿后 409 locked_version"""
    version = _version_or_404(db, version_id)
    try:
        return {"data": versions_repo.update_content(db, version, payload)}
    except ValueError as exc:
        raise AppError(status_code=409, code="locked_version",
                       message=str(exc).split(":", 1)[1].strip()) from exc


# ---------------------------------------------------------------- 版本：状态机

@router.post("/resume-versions/{version_id}/regenerate", response_model=Data[StartAgentTaskData], status_code=202)
def regenerate_version(version_id: str, payload: RegenerateRequest, db: Session = Depends(get_db)):
    """重生成（202）：以当前版本为基线 + 修改意见 → 新版本号新行（02 决策 #5）"""
    version = _version_or_404(db, version_id)
    params = {
        "resume_id": version.resume_id,
        "based_on_version": version_id,
        "jd_id": version.jd_id,
        "instruction": payload.instruction,
    }
    data = _start_task(db, "resume_generate", params,
                       {"resume_id": version.resume_id, "resume_version_id": version_id},
                       "该简历已有进行中的生成任务")
    return {"data": data}


@router.post("/resume-versions/{version_id}/reflect", response_model=Data[StartAgentTaskData], status_code=202)
def reflect_version(version_id: str, db: Session = Depends(get_db)):
    """真实性/覆盖度校验（202）：确定性程序检查 + LLM 关键词裁决，结果回填当前版本"""
    version = _version_or_404(db, version_id)
    params = {"resume_version_id": version_id}
    data = _start_task(db, "reflection", params, {"resume_version_id": version_id},
                       "该版本已有进行中的校验任务")
    return {"data": data}


@router.post("/resume-versions/{version_id}/confirm", response_model=Data[VersionConfirmData])
def confirm_version(version_id: str, db: Session = Depends(get_db)):
    """定稿（200）：锁定内容；未 reflect 时同步跑程序侧确定性检查
    （项目存在性/数字核对/关键词覆盖，无 LLM）后回填，再锁定"""
    version = _version_or_404(db, version_id)
    if version.confirmed_at is not None:
        raise AppError(status_code=409, code="locked_version", message="该版本已定稿锁定")

    if version.reflection_status == ReflectionStatus.pending:
        result = reflection_checks.program_reflect(db, version)
        status = ReflectionStatus.passed if result["fabrication"]["passed"] else ReflectionStatus.issues
        version = versions_repo.apply_reflection(db, version, status=status, result=result)
    version = versions_repo.confirm(db, version)
    return {"data": VersionConfirmData(reflection_status=version.reflection_status, locked=True)}


# ---------------------------------------------------------------- 渲染（非 envelope，04 §10.4）

@router.get("/resume-versions/{version_id}/preview")
def preview_version(
    version_id: str,
    format: Literal["md", "html"] = Query(..., description="md = 编辑器内预览，html = 模板渲染"),
    db: Session = Depends(get_db),
):
    version = _version_or_404(db, version_id)
    if format == "md":
        return Response(rendering.render_markdown(version.content),
                        media_type="text/markdown; charset=utf-8")

    resume = _resume_or_404(db, version.resume_id)
    if resume.template is None:
        raise AppError(status_code=409, code="template_not_selected", message="请先为该简历选择模板，再预览 HTML")
    return HTMLResponse(rendering.render_html(version.content, resume.template.value))


@router.get("/resume-versions/{version_id}/export")
def export_version(
    version_id: str,
    format: Literal["html", "pdf"] = Query(..., description="导出格式"),
    db: Session = Depends(get_db),
):
    version = _version_or_404(db, version_id)
    resume = _resume_or_404(db, version.resume_id)

    base = f"{resume.title or resume.target_role}-v{version.version_number}"
    if format == "html":
        if resume.template is None:
            raise AppError(status_code=409, code="template_not_selected",
                           message="请先为该简历选择模板，再导出 HTML")
        html = rendering.render_html(version.content, resume.template.value)
        disposition = _disposition(f"{base}.html")
        return Response(html, media_type="text/html; charset=utf-8",
                        headers={"Content-Disposition": disposition})

    # PDF：模板未选时按 classic 兜底渲染（前端 mock 同语义），playwright 打印
    html = rendering.render_html(version.content, resume.template.value if resume.template else None)
    try:
        pdf = rendering.html_to_pdf(html)
    except ValueError as exc:   # "pdf_not_available: …"
        code, _, message = str(exc).partition(":")
        raise AppError(status_code=501, code=code.strip(), message=message.strip()) from exc
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": _disposition(f"{base}.pdf")})


def _disposition(filename: str) -> str:
    '''Content-Disposition：ASCII 回落 + filename* RFC 5987（中文文件名两端约定）'''
    ascii_fallback = filename.encode("ascii", errors="ignore").decode() or "resume"
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"
