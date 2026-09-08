'''
Projects 路由（04 §5.2）：项目 CRUD / 证据（嵌套建、顶层改删）/ 技能关联 / 场景表达 / AI 辅助填写

表达生成与 assist 均走 04 §3.1 统一任务协议：冲突预检（409 task_running）→
建 agent_runs 行 → manager.submit → 202；产物由任务协程落库，前端 SSE 后 refetch。

路由分两种前缀：
- /projects/{id}/…   嵌套资源（evidence / skills / expressions / assist）
- /evidence/{id}、/project-expressions/{id}  顶层改删（前端契约，04 §5.2）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from backend.api.errors import AppError
from backend.api.listing import PageParams, data_list
from backend.database.models import ExpressionType
from backend.database.session import get_db
from backend.repositories import agent_runs as agent_runs_repo
from backend.repositories import evidence as evidence_repo
from backend.repositories import project_expressions as expressions_repo
from backend.repositories import project_skills as project_skills_repo
from backend.repositories import projects as projects_repo
from backend.schemas.career_assets import (
    AssistMessagesRequest,
    AssistQuestionnaireRequest,
    AssistRefillRequest,
    EvidencePatch,
    EvidenceRead,
    EvidenceWrite,
    ExpressionGenerate,
    ProjectExpressionRead,
    ProjectExpressionUpdate,
    ProjectPatch,
    ProjectRead,
    ProjectSkillsSet,
    ProjectWrite,
    SkillRead,
)
from backend.schemas.common import Data, DataList, StartAgentTaskData
from backend.services.agent_tasks.manager import manager
from backend.services.agent_tasks.registry import get_task

router = APIRouter(prefix="/api/v1", tags=["Projects"])


def _project_or_404(db: Session, project_id: str):
    project = projects_repo.get(db, project_id)
    if project is None:
        raise AppError(status_code=404, code="not_found", message=f"项目 {project_id} 不存在")
    return project


def _start_task(db: Session, prompt_name: str, params: dict, input_refs: dict) -> dict:
    """任务触发样板（jd_analysis.analyze_jd 同款）：冲突预检 → 建行 → 提交 → 202 响应体"""
    task_def = get_task(prompt_name)
    conflict_key = task_def.conflict_key(params) if task_def.conflict_key else None
    if conflict_key is not None and manager.is_reserved(conflict_key):
        raise AppError(status_code=409, code="task_running", message="该项目已有进行中的同类任务")
    run = agent_runs_repo.create(
        db, agent_type=task_def.agent_type, prompt_name=task_def.prompt_name, input_refs=input_refs,
    )
    manager.submit(run.id, task_def.prompt_name, params, input_refs)
    return {"agent_run_id": run.id, "status": "running"}


# ---------------------------------------------------------------- 项目 CRUD

@router.get("/projects", response_model=DataList[ProjectRead])
def list_projects(
    request: Request,
    q: Optional[str] = Query(None, description="04 §2.3：项目名 ILIKE 搜索"),
    sort: Optional[str] = Query(None, description="04 §2.3：?sort=-created_at | name | sort_order"),
    paging: PageParams = Depends(PageParams),
    db: Session = Depends(get_db),
):
    rows, total = projects_repo.list_projects(
        db, page=paging.page, per_page=paging.per_page, q=q, sort=sort
    )
    return data_list(request, rows, total, paging.page, paging.per_page)


@router.post("/projects", response_model=Data[ProjectRead], status_code=201)
def create_project(payload: ProjectWrite, response: Response, db: Session = Depends(get_db)):
    project = projects_repo.create(db, payload)
    response.headers["Location"] = f"/api/v1/projects/{project.id}"
    return {"data": project}


@router.get("/projects/{project_id}", response_model=Data[ProjectRead])
def get_project(project_id: str, db: Session = Depends(get_db)):
    return {"data": _project_or_404(db, project_id)}


@router.patch("/projects/{project_id}", response_model=Data[ProjectRead])
def patch_project(project_id: str, payload: ProjectPatch, db: Session = Depends(get_db)):
    project = _project_or_404(db, project_id)
    return {"data": projects_repo.update(db, project, payload)}


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = _project_or_404(db, project_id)
    projects_repo.delete(db, project)


# ---------------------------------------------------------------- 证据（evidence）

@router.get("/projects/{project_id}/evidence", response_model=Data[List[EvidenceRead]])
def list_evidence(project_id: str, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    return {"data": evidence_repo.list_for_project(db, project_id)}


@router.post("/projects/{project_id}/evidence", response_model=Data[EvidenceRead], status_code=201)
def create_evidence(project_id: str, payload: EvidenceWrite, response: Response,
                    db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    item = evidence_repo.create(db, project_id, payload)
    response.headers["Location"] = f"/api/v1/evidence/{item.id}"
    return {"data": item}


@router.patch("/evidence/{evidence_id}", response_model=Data[EvidenceRead])
def patch_evidence(evidence_id: str, payload: EvidencePatch, db: Session = Depends(get_db)):
    evidence = evidence_repo.get(db, evidence_id)
    if evidence is None:
        raise AppError(status_code=404, code="not_found", message=f"证据 {evidence_id} 不存在")
    return {"data": evidence_repo.update(db, evidence, payload)}


@router.delete("/evidence/{evidence_id}", status_code=204)
def delete_evidence(evidence_id: str, db: Session = Depends(get_db)):
    evidence = evidence_repo.get(db, evidence_id)
    if evidence is None:
        raise AppError(status_code=404, code="not_found", message=f"证据 {evidence_id} 不存在")
    evidence_repo.delete(db, evidence)


# ---------------------------------------------------------------- 技能关联

@router.get("/projects/{project_id}/skills", response_model=Data[List[SkillRead]])
def get_project_skills(project_id: str, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    return {"data": project_skills_repo.list_skills_of(db, project_id)}


@router.put("/projects/{project_id}/skills")
def set_project_skills(project_id: str, payload: ProjectSkillsSet, db: Session = Depends(get_db)):
    """整体替换关联（04 §5.2）：skill_ids 为完整列表；未知 id 404，响应 {"data": null}"""
    _project_or_404(db, project_id)
    try:
        project_skills_repo.replace(db, project_id, payload.skill_ids)
    except ValueError as exc:   # "not_found: …"（repo 抛，语义见模块 docstring）
        raise AppError(status_code=404, code="not_found", message=str(exc).split(":", 1)[1].strip()) from exc
    return {"data": None}


# ---------------------------------------------------------------- 场景表达

@router.get("/projects/{project_id}/expressions", response_model=Data[List[ProjectExpressionRead]])
def list_expressions(
    project_id: str,
    type: Optional[ExpressionType] = Query(None, description="按场景过滤，缺省全部"),
    db: Session = Depends(get_db),
):
    _project_or_404(db, project_id)
    return {"data": expressions_repo.list_for_project(db, project_id, type)}


@router.post("/projects/{project_id}/expressions", response_model=Data[StartAgentTaskData], status_code=202)
def generate_expression(project_id: str, payload: ExpressionGenerate, db: Session = Depends(get_db)):
    """生成场景表达（202）：同组合重生成 = 版本号自增新行，旧版本不动（02 决策 #5）"""
    _project_or_404(db, project_id)
    params = {"project_id": project_id, "type": payload.type.value}
    data = _start_task(db, "project_expression", params, {"project_id": project_id})
    return {"data": data}


@router.patch("/project-expressions/{expression_id}", response_model=Data[ProjectExpressionRead])
def patch_expression(expression_id: str, payload: ProjectExpressionUpdate, db: Session = Depends(get_db)):
    """确认（status=confirmed，Human-in-the-loop）或编辑内容（整体替换该版本）"""
    expression = expressions_repo.get(db, expression_id)
    if expression is None:
        raise AppError(status_code=404, code="not_found", message=f"表达 {expression_id} 不存在")
    return {"data": expressions_repo.update(db, expression, payload)}


# ---------------------------------------------------------------- AI 辅助填写（两段式，04 决策 #4）

@router.post("/projects/{project_id}/assist/questionnaire",
             response_model=Data[StartAgentTaskData], status_code=202)
def assist_questionnaire(project_id: str, payload: AssistQuestionnaireRequest,
                         db: Session = Depends(get_db)):
    """第一段问卷（202）：done.result.follow_up 为追问文案；前端进第二段自由对话"""
    _project_or_404(db, project_id)
    params = {
        "project_id": project_id,
        "answers": [{"question": a.question, "answer": a.answer} for a in payload.answers],
    }
    data = _start_task(db, "assist_questionnaire", params, {"project_id": project_id})
    return {"data": data}


@router.post("/projects/{project_id}/assist/messages",
             response_model=Data[StartAgentTaskData], status_code=202)
def assist_chat(project_id: str, payload: AssistMessagesRequest, db: Session = Depends(get_db)):
    """第二段对话（202）：chunk 流式回复，无 result 落库"""
    _project_or_404(db, project_id)
    params = {
        "project_id": project_id,
        "messages": [{"role": m.role, "content": m.content} for m in payload.messages],
    }
    data = _start_task(db, "assist_chat", params, {"project_id": project_id})
    return {"data": data}


@router.post("/projects/{project_id}/assist/refill",
             response_model=Data[StartAgentTaskData], status_code=202)
def assist_refill(project_id: str, payload: AssistRefillRequest, db: Session = Depends(get_db)):
    """STOP 并回填（202）：done.result.fields 为七字段建议；用户确认后 PATCH /projects/{id}"""
    _project_or_404(db, project_id)
    params = {
        "project_id": project_id,
        "messages": [{"role": m.role, "content": m.content} for m in payload.messages],
    }
    data = _start_task(db, "assist_refill", params, {"project_id": project_id})
    return {"data": data}
