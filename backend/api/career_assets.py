'''
Career Assets 路由（04 §4 / §5.2）

basic-info（单例 upsert）/ educations / experiences / honors（同构三件套 + reorder）
/ skills（UNIQUE 重名 409）/ polish-self-eval（AI 优化自我评价，202）。

每个端点的三件套写法（照 basic_info 样板）：
1. 参数：请求体 DTO / 路径参数 / Depends(get_db)
2. 调用 repository；取不到或冲突 → raise AppError（code 见 04 §6）
3. 成功 → 返回 {"data": ...}，由 response_model=Data[XxxRead] 包 envelope 并强校验出参

reorder 的 ValueError 翻译约定（04 决策 #7）：
- "not_found: …"   → 404（ids 含未知资源）
- "incomplete: …"  → 422（ids 未覆盖全部行）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List, Optional

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from backend.api.errors import AppError
from backend.database.session import get_db
from backend.repositories import agent_runs as agent_runs_repo
from backend.repositories import basic_info as basic_info_repo
from backend.repositories import educations as educations_repo
from backend.repositories import experiences as experiences_repo
from backend.repositories import honors as honors_repo
from backend.repositories import skills as skills_repo
from backend.schemas.career_assets import (
    BasicInfoRead,
    BasicInfoWrite,
    EducationPatch,
    EducationRead,
    EducationWrite,
    ExperiencePatch,
    ExperienceRead,
    ExperienceWrite,
    HonorPatch,
    HonorRead,
    HonorWrite,
    SkillPatch,
    SkillRead,
    SkillWrite,
)
from backend.schemas.common import Data, ReorderRequest, StartAgentTaskData
from backend.services.agent_tasks.manager import manager
from backend.services.agent_tasks.registry import get_task

router = APIRouter(prefix="/api/v1", tags=["Career Assets"])


# ---------------------------------------------------------------- basic-info

@router.get("/basic-info", response_model=Data[Optional[BasicInfoRead]])
def get_basic_info(db: Session = Depends(get_db)):
    """GET /basic-info：单例读取；未填写返回 {"data": null}（前端 apiGet<BasicInfo|null> 契约）"""
    info = basic_info_repo.get_basic_info(db)
    return {"data": info}


@router.put("/basic-info", response_model=Data[BasicInfoRead])
def put_basic_info(payload: BasicInfoWrite, db: Session = Depends(get_db)):
    """PUT /basic-info：全量 upsert（04 §5.2「不存在时 PUT 创建」），无 DELETE。
    全量语义：body 没带的字段置 NULL——前端整单提交"""
    info = basic_info_repo.upsert_basic_info(db, payload)
    return {"data": info}


@router.post("/basic-info/polish-self-eval", response_model=Data[StartAgentTaskData], status_code=202)
def polish_self_eval(db: Session = Depends(get_db)):
    """AI 优化自我评价（04 §5.2 决策 #2 独立端点）：202；chunk 流式展示，
    done.result.self_evaluation 为回填建议，用户确认后 PUT /basic-info"""
    if basic_info_repo.get_basic_info(db) is None:
        raise AppError(status_code=404, code="not_found", message="请先填写基本信息")

    task_def = get_task("polish_self_eval")
    params: dict = {}
    if manager.is_reserved(task_def.conflict_key(params)):
        raise AppError(status_code=409, code="task_running", message="已有进行中的自我评价优化任务")
    run = agent_runs_repo.create(
        db, agent_type=task_def.agent_type, prompt_name=task_def.prompt_name, input_refs={},
    )
    manager.submit(run.id, task_def.prompt_name, params, {})
    return {"data": {"agent_run_id": run.id, "status": "running"}}


# ------------------------------------------------- 同构三件套公共助手（三件套 × 5 端点 + reorder）

def _translate_reorder_error(exc: ValueError) -> AppError:
    """reorder ValueError → AppError（见模块 docstring 翻译约定）"""
    message = str(exc)
    if message.startswith("not_found"):
        return AppError(status_code=404, code="not_found", message=message.split(":", 1)[1].strip())
    return AppError(status_code=422, code="validation_error", message=message.split(":", 1)[1].strip())


def _reorder_or_404(db: Session, repo, ids: List[str]) -> dict:
    try:
        repo.reorder(db, ids)
    except ValueError as exc:
        raise _translate_reorder_error(exc) from exc
    return {"data": None}


# ---------------------------------------------------------------- educations

@router.get("/educations", response_model=Data[List[EducationRead]])
def list_educations(db: Session = Depends(get_db)):
    return {"data": educations_repo.list_educations(db)}


@router.post("/educations", response_model=Data[EducationRead], status_code=201)
def create_education(payload: EducationWrite, response: Response, db: Session = Depends(get_db)):
    education = educations_repo.create(db, payload)
    response.headers["Location"] = f"/api/v1/educations/{education.id}"
    return {"data": education}


@router.get("/educations/{education_id}", response_model=Data[EducationRead])
def get_education(education_id: str, db: Session = Depends(get_db)):
    education = educations_repo.get(db, education_id)
    if education is None:
        raise AppError(status_code=404, code="not_found", message=f"教育记录 {education_id} 不存在")
    return {"data": education}


@router.patch("/educations/{education_id}", response_model=Data[EducationRead])
def patch_education(education_id: str, payload: EducationPatch, db: Session = Depends(get_db)):
    education = educations_repo.get(db, education_id)
    if education is None:
        raise AppError(status_code=404, code="not_found", message=f"教育记录 {education_id} 不存在")
    return {"data": educations_repo.update(db, education, payload)}


@router.delete("/educations/{education_id}", status_code=204)
def delete_education(education_id: str, db: Session = Depends(get_db)):
    education = educations_repo.get(db, education_id)
    if education is None:
        raise AppError(status_code=404, code="not_found", message=f"教育记录 {education_id} 不存在")
    educations_repo.delete(db, education)


@router.put("/educations/reorder")
def reorder_educations(payload: ReorderRequest, db: Session = Depends(get_db)):
    """批量排序（04 决策 #7）：ids 顺序即新 sort_order；响应 {"data": null}"""
    return _reorder_or_404(db, educations_repo, payload.ids)


# ---------------------------------------------------------------- experiences

@router.get("/experiences", response_model=Data[List[ExperienceRead]])
def list_experiences(db: Session = Depends(get_db)):
    return {"data": experiences_repo.list_experiences(db)}


@router.post("/experiences", response_model=Data[ExperienceRead], status_code=201)
def create_experience(payload: ExperienceWrite, response: Response, db: Session = Depends(get_db)):
    experience = experiences_repo.create(db, payload)
    response.headers["Location"] = f"/api/v1/experiences/{experience.id}"
    return {"data": experience}


@router.get("/experiences/{experience_id}", response_model=Data[ExperienceRead])
def get_experience(experience_id: str, db: Session = Depends(get_db)):
    experience = experiences_repo.get(db, experience_id)
    if experience is None:
        raise AppError(status_code=404, code="not_found", message=f"经历记录 {experience_id} 不存在")
    return {"data": experience}


@router.patch("/experiences/{experience_id}", response_model=Data[ExperienceRead])
def patch_experience(experience_id: str, payload: ExperiencePatch, db: Session = Depends(get_db)):
    experience = experiences_repo.get(db, experience_id)
    if experience is None:
        raise AppError(status_code=404, code="not_found", message=f"经历记录 {experience_id} 不存在")
    return {"data": experiences_repo.update(db, experience, payload)}


@router.delete("/experiences/{experience_id}", status_code=204)
def delete_experience(experience_id: str, db: Session = Depends(get_db)):
    experience = experiences_repo.get(db, experience_id)
    if experience is None:
        raise AppError(status_code=404, code="not_found", message=f"经历记录 {experience_id} 不存在")
    experiences_repo.delete(db, experience)


@router.put("/experiences/reorder")
def reorder_experiences(payload: ReorderRequest, db: Session = Depends(get_db)):
    return _reorder_or_404(db, experiences_repo, payload.ids)


# ---------------------------------------------------------------- honors

@router.get("/honors", response_model=Data[List[HonorRead]])
def list_honors(db: Session = Depends(get_db)):
    return {"data": honors_repo.list_honors(db)}


@router.post("/honors", response_model=Data[HonorRead], status_code=201)
def create_honor(payload: HonorWrite, response: Response, db: Session = Depends(get_db)):
    honor = honors_repo.create(db, payload)
    response.headers["Location"] = f"/api/v1/honors/{honor.id}"
    return {"data": honor}


@router.get("/honors/{honor_id}", response_model=Data[HonorRead])
def get_honor(honor_id: str, db: Session = Depends(get_db)):
    honor = honors_repo.get(db, honor_id)
    if honor is None:
        raise AppError(status_code=404, code="not_found", message=f"荣誉记录 {honor_id} 不存在")
    return {"data": honor}


@router.patch("/honors/{honor_id}", response_model=Data[HonorRead])
def patch_honor(honor_id: str, payload: HonorPatch, db: Session = Depends(get_db)):
    honor = honors_repo.get(db, honor_id)
    if honor is None:
        raise AppError(status_code=404, code="not_found", message=f"荣誉记录 {honor_id} 不存在")
    return {"data": honors_repo.update(db, honor, payload)}


@router.delete("/honors/{honor_id}", status_code=204)
def delete_honor(honor_id: str, db: Session = Depends(get_db)):
    honor = honors_repo.get(db, honor_id)
    if honor is None:
        raise AppError(status_code=404, code="not_found", message=f"荣誉记录 {honor_id} 不存在")
    honors_repo.delete(db, honor)


@router.put("/honors/reorder")
def reorder_honors(payload: ReorderRequest, db: Session = Depends(get_db)):
    return _reorder_or_404(db, honors_repo, payload.ids)


# ---------------------------------------------------------------- skills

@router.get("/skills", response_model=Data[List[SkillRead]])
def list_skills(db: Session = Depends(get_db)):
    return {"data": skills_repo.list_skills(db)}


@router.post("/skills", response_model=Data[SkillRead], status_code=201)
def create_skill(payload: SkillWrite, response: Response, db: Session = Depends(get_db)):
    """创建技能；重名 409 skill_name_exists（04 §6）"""
    try:
        skill = skills_repo.create(db, payload)
    except ValueError as exc:
        raise AppError(status_code=409, code="skill_name_exists", message=str(exc).split(":", 1)[1].strip()) from exc
    response.headers["Location"] = f"/api/v1/skills/{skill.id}"
    return {"data": skill}


@router.get("/skills/{skill_id}", response_model=Data[SkillRead])
def get_skill(skill_id: str, db: Session = Depends(get_db)):
    skill = skills_repo.get(db, skill_id)
    if skill is None:
        raise AppError(status_code=404, code="not_found", message=f"技能 {skill_id} 不存在")
    return {"data": skill}


@router.patch("/skills/{skill_id}", response_model=Data[SkillRead])
def patch_skill(skill_id: str, payload: SkillPatch, db: Session = Depends(get_db)):
    skill = skills_repo.get(db, skill_id)
    if skill is None:
        raise AppError(status_code=404, code="not_found", message=f"技能 {skill_id} 不存在")
    try:
        return {"data": skills_repo.update(db, skill, payload)}
    except ValueError as exc:
        raise AppError(status_code=409, code="skill_name_exists", message=str(exc).split(":", 1)[1].strip()) from exc


@router.delete("/skills/{skill_id}", status_code=204)
def delete_skill(skill_id: str, db: Session = Depends(get_db)):
    skill = skills_repo.get(db, skill_id)
    if skill is None:
        raise AppError(status_code=404, code="not_found", message=f"技能 {skill_id} 不存在")
    skills_repo.delete(db, skill)
