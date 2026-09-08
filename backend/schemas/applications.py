'''
Applications / Interview QA / Dashboard 模块 DTO（04 §5.6 / §5.1 / 前端契约）

- ApplicationRead.resume_version：投递引用的简历版本摘要（JOIN 带出，可空）；
  列表与 dashboard 最近投递共用同一富化逻辑
- InterviewQA 创建时 application_id 提供则由后端带出 company/position（忽略 body 冲突值）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.database.models import ApplicationStatus


# ---------------------------------------------------------------------------
# Applications（投递记录，04 §5.6）
# ---------------------------------------------------------------------------

class ApplicationWrite(BaseModel):
    """POST /applications（前端 createApplication body）"""
    company: str = Field(..., min_length=1, description="公司")
    position: str = Field(..., min_length=1, description="岗位")
    status: ApplicationStatus = Field(ApplicationStatus.to_apply, description="投递状态，默认待投递")
    applied_at: Optional[date] = Field(None, description="投递时间；待投递为空")
    resume_version_id: Optional[str] = Field(None, description="使用的简历版本")
    note: Optional[str] = Field(None, description="备注")


class ApplicationPatch(BaseModel):
    """PATCH /applications/{id}：状态流转 = 普通 PATCH（任意两态允许，PRD 未限定）"""
    company: Optional[str] = Field(None, min_length=1)
    position: Optional[str] = Field(None, min_length=1)
    status: Optional[ApplicationStatus] = None
    applied_at: Optional[date] = None
    resume_version_id: Optional[str] = None
    note: Optional[str] = None


class ResumeVersionSummary(BaseModel):
    """投递记录携带的简历版本摘要（04 §5.1）"""
    model_config = ConfigDict(from_attributes=True)

    id: str
    resume_title: str = Field(..., description="所属简历显示名（resumes.title）")
    version_number: int


class ApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company: str
    position: str
    status: ApplicationStatus
    applied_at: Optional[date]
    resume_version_id: Optional[str]
    note: Optional[str]
    created_at: datetime
    resume_version: Optional[ResumeVersionSummary] = Field(None, description="引用的简历版本摘要，无引用为 null")


# ---------------------------------------------------------------------------
# Interview QA（面试问题记录，04 §5.6）
# ---------------------------------------------------------------------------

class InterviewQAWrite(BaseModel):
    """POST /interview-qa；application_id 提供时 company/position 由后端从投递记录带出"""
    application_id: Optional[str] = Field(None, description="关联投递，自动带出公司/岗位")
    company: str = Field(..., min_length=1, description="公司（关联投递时以后端带出为准）")
    position: Optional[str] = Field(None, description="岗位（关联投递时以后端带出为准）")
    interview_at: Optional[date] = Field(None, description="面试时间")
    question: str = Field(..., min_length=1, description="面试问题")
    answer: Optional[str] = Field(None, description="我的回答")
    note: Optional[str] = Field(None, description="复盘备注")


class InterviewQAPatch(BaseModel):
    """PATCH /interview-qa/{id}"""
    application_id: Optional[str] = None
    company: Optional[str] = Field(None, min_length=1)
    position: Optional[str] = None
    interview_at: Optional[date] = None
    question: Optional[str] = Field(None, min_length=1)
    answer: Optional[str] = None
    note: Optional[str] = None


class InterviewQARead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    application_id: Optional[str]
    company: str
    position: Optional[str]
    interview_at: Optional[date]
    question: str
    answer: Optional[str]
    note: Optional[str]
    created_at: datetime


# ---------------------------------------------------------------------------
# Dashboard（04 §5.1：统计 + 盘点进度 + 最近投递）
# ---------------------------------------------------------------------------

class DashboardStats(BaseModel):
    """统计口径（02 §8 / 04 §5.1）：applied = status<>to_apply；replied ∈ {replied,interview,offer}"""
    applied: int
    replied: int
    interview: int
    offer: int
    reply_rate: float = Field(..., description="replied / applied，两位小数；applied=0 时为 0")


class AssetProgress(BaseModel):
    """资产盘点进度（引导用户补全资产库）"""
    basic_info: bool
    projects_count: int
    skills_count: int
    education_count: int


class DashboardData(BaseModel):
    """GET /dashboard 响应本体"""
    stats: DashboardStats
    asset_progress: AssetProgress
    recent_applications: List[ApplicationRead] = Field(..., description="最近投递 5 条（applied_at 倒序）")
