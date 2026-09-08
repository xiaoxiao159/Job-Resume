'''
Resumes / Resume Versions 模块 DTO（04 §5.4 / 前端 resumes.ts 契约）

- ResumeVersionRead：content / reflection_result 直接透传 JSONB（02 §6.1 / §6.5 结构，
  生成侧已用 Pydantic 校验后落库，出口不再重复建模）
- 版本状态机（04 §5.4）：pending 可编辑（PATCH content）→ reflect 判 passed/issues
  → confirm 定稿（confirmed_at 落时间，此后 content PATCH 一律 409 locked_version）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.database.models import ReflectionStatus, ResumeTemplate


# ---------------------------------------------------------------------------
# Resumes（按目标岗位分类）
# ---------------------------------------------------------------------------

class ResumeWrite(BaseModel):
    """POST /resumes：title 缺省取 target_role（前端 createResume 契约）"""
    title: Optional[str] = Field(None, description="显示名，缺省取目标岗位")
    target_role: str = Field(..., min_length=1, description="目标岗位（UNIQUE(user_id, target_role)，409 target_role_exists）")


class ResumePatch(BaseModel):
    """PATCH /resumes/{id}：改 title / template（04 §5.4）"""
    title: Optional[str] = Field(None, min_length=1)
    template: Optional[ResumeTemplate] = None


class ResumeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    target_role: str
    template: Optional[ResumeTemplate] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Resume Versions（内容快照 + Reflection）
# ---------------------------------------------------------------------------

class VersionGenerateRequest(BaseModel):
    """POST /resumes/{id}/versions（202）：生成定制简历；jd_id 可空 = Master 版"""
    jd_id: Optional[str] = Field(None, description="定制依据 JD；空 = Master 版")
    instruction: Optional[str] = Field(None, description="用户补充指令（如「突出 Agent 项目」）")


class RegenerateRequest(BaseModel):
    """POST /resume-versions/{id}/regenerate（202）：重生成 v+1 新版本（当前版本不动）"""
    instruction: Optional[str] = Field(None, description="修改意见（如「去掉 Docker 相关表述」）")


class ResumeVersionRead(BaseModel):
    """GET /resumes/{id}/versions 列表项与 /resume-versions/{id} 详情共用"""
    model_config = ConfigDict(from_attributes=True)

    id: str
    resume_id: str
    version_number: int
    content: dict = Field(..., description="8 段完整快照，02 §6.1")
    reflection_status: ReflectionStatus
    reflection_result: Optional[dict] = Field(None, description="02 §6.5；未 reflect 为 null")
    confirmed_at: Optional[datetime] = Field(None, description="非空即定稿锁定")
    updated_at: datetime
    created_at: datetime


class ResumeVersionPatch(BaseModel):
    """PATCH /resume-versions/{id}：仅 pending 可编辑（定稿后 409 locked_version）"""
    content: dict = Field(..., description="编辑后的 8 段快照，整体替换")


class VersionConfirmData(BaseModel):
    """POST /resume-versions/{id}/confirm 200 响应（04 §5.4）"""
    reflection_status: ReflectionStatus
    locked: bool = Field(True, description="定稿后恒为 true")
