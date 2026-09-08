'''
Career Assets 模块 DTO（依据 04-api-design v0.2 §5.2，与 02 表结构一一对应）

命名约定：
- XxxRead   响应体：Write 全部字段 + id / 时间戳；from_attributes=True 可直吃 ORM 对象
- XxxWrite  POST 请求体（必填字段按 02 表约束）；PUT basic-info 为全量语义沿用 Write
- XxxPatch  PATCH 请求体（全字段可空，前端 Partial<T> 契约；exclude_unset 部分更新）
- 动作 body：ReorderRequest（common.py）、ProjectSkillsSet、ExpressionGenerate 等

服务器托管字段（id / user_id / created_at / updated_at / 嵌套路径上的父 id）一律不进请求体。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.database.models import (
    Availability,
    Degree,
    EvidenceType,
    ExperienceType,
    ExpressionStatus,
    ExpressionType,
    Proficiency,
)


# ---------------------------------------------------------------------------
# Basic Info（单例 upsert）
# ---------------------------------------------------------------------------

class BasicInfoWrite(BaseModel):
    """PUT /basic-info 全量 upsert（04 §5.2：GET 不存在时，PUT 即创建）"""
    name: str = Field(..., description="姓名")
    email: str = Field(..., description="简历展示邮箱，可与登录邮箱不同")
    phone: str = Field(..., description="电话")
    github_url: str = Field(..., description="GitHub 主页地址")
    homepage_url: Optional[str] = Field(None, description="个人主页，可选")
    job_role: Optional[str] = Field(None, description="意向岗位（F1.1）")
    city: Optional[str] = Field(None, description="意向城市")
    availability: Optional[Availability] = Field(None, description="到岗时间")
    self_evaluation: Optional[str] = Field(None, description="自我评价（简历第 8 段来源）")


class BasicInfoRead(BasicInfoWrite):
    """GET /basic-info 响应（含 id 与时间戳，不含 user_id——单用户模式下不暴露）"""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="资源 id")
    created_at: datetime = Field(..., description="创建时间，ISO 8601 UTC")
    updated_at: datetime = Field(..., description="更新时间")


# ---------------------------------------------------------------------------
# Educations / Experiences / Honors（同构三件套）
# ---------------------------------------------------------------------------

class EducationWrite(BaseModel):
    """POST/PATCH /educations〔/id〕共用"""
    school: str = Field(..., description="学校")
    major: str = Field(..., description="专业")
    degree: Degree = Field(..., description="学历阶段")
    start_date: Optional[date] = Field(None, description="开始日期 YYYY-MM-DD")
    end_date: Optional[date] = Field(None, description="结束日期，在读可空")
    courses: Optional[str] = Field(None, description="主修课程，可选补充")
    sort_order: int = Field(0, description="简历展示顺序")


class EducationRead(EducationWrite):
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="资源 id")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class EducationPatch(BaseModel):
    """PATCH /educations/{id}：部分更新（前端 Partial<Education> 契约）"""
    school: Optional[str] = Field(None, min_length=1)
    major: Optional[str] = Field(None, min_length=1)
    degree: Optional[Degree] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    courses: Optional[str] = None
    sort_order: Optional[int] = None


class ExperienceWrite(BaseModel):
    """POST /experiences；科研/校园结构相同，type 区分（02 决策 #2）"""
    type: ExperienceType = Field(..., description="经历类型 research / campus")
    name: str = Field(..., description="经历名称")
    role: Optional[str] = Field(None, description="角色")
    start_date: Optional[date] = Field(None, description="开始日期")
    end_date: Optional[date] = Field(None, description="结束日期")
    description: Optional[str] = Field(None, description="描述")
    sort_order: int = Field(0, description="简历展示顺序")


class ExperienceRead(ExperienceWrite):
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="资源 id")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class ExperiencePatch(BaseModel):
    """PATCH /experiences/{id}：部分更新"""
    type: Optional[ExperienceType] = None
    name: Optional[str] = Field(None, min_length=1)
    role: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class HonorWrite(BaseModel):
    """POST /honors"""
    name: str = Field(..., description="证书/荣誉名称")
    time: Optional[str] = Field(None, description="自由时间串，如「2026 年 6 月」")
    sort_order: int = Field(0, description="简历展示顺序")


class HonorRead(HonorWrite):
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="资源 id")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class HonorPatch(BaseModel):
    """PATCH /honors/{id}：部分更新"""
    name: Optional[str] = Field(None, min_length=1)
    time: Optional[str] = None
    sort_order: Optional[int] = None


# ---------------------------------------------------------------------------
# Projects / Evidence / Skills 关联
# ---------------------------------------------------------------------------

class ProjectWrite(BaseModel):
    """POST/PATCH /projects〔/id〕共用；字段即「通用版表达」载体（02 决策 #3）"""
    name: str = Field(..., description="项目名称")
    summary: Optional[str] = Field(None, description="项目简介")
    background: Optional[str] = Field(None, description="项目背景")
    goal: Optional[str] = Field(None, description="项目目标")
    start_date: Optional[date] = Field(None, description="开始日期")
    end_date: Optional[date] = Field(None, description="结束日期")
    role: Optional[str] = Field(None, description="项目角色")
    tech_stack: List[str] = Field(default_factory=list, description="技术栈清单（展示用）")
    responsibilities: Optional[str] = Field(None, description="个人职责")
    core_work: Optional[str] = Field(None, description="核心工作")
    difficulties: Optional[str] = Field(None, description="技术难点")
    solutions: Optional[str] = Field(None, description="解决方案")
    results: Optional[str] = Field(None, description="项目成果")
    github_url: Optional[str] = Field(None, description="代码仓库地址")
    demo_url: Optional[str] = Field(None, description="演示地址")
    sort_order: int = Field(0, description="展示顺序")


class ProjectRead(ProjectWrite):
    """GET /projects〔/{id}〕响应"""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="资源 id")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class ProjectPatch(BaseModel):
    """PATCH /projects/{id}：部分更新（回填确认也走这里，04 §5.2 ④）"""
    name: Optional[str] = Field(None, min_length=1)
    summary: Optional[str] = None
    background: Optional[str] = None
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    role: Optional[str] = None
    tech_stack: Optional[List[str]] = None
    responsibilities: Optional[str] = None
    core_work: Optional[str] = None
    difficulties: Optional[str] = None
    solutions: Optional[str] = None
    results: Optional[str] = None
    github_url: Optional[str] = None
    demo_url: Optional[str] = None
    sort_order: Optional[int] = None


class EvidenceWrite(BaseModel):
    """POST /projects/{id}/evidence（project_id 走 URL 路径）"""
    type: EvidenceType = Field(..., description="证据类型")
    title: str = Field(..., description="展示名，如「GitHub 仓库」")
    url: Optional[str] = Field(None, description="链接地址")
    note: Optional[str] = Field(None, description="备注")


class EvidenceRead(EvidenceWrite):
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="资源 id")
    project_id: str = Field(..., description="所属项目 id")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class EvidencePatch(BaseModel):
    """PATCH /evidence/{id}：部分更新"""
    type: Optional[EvidenceType] = None
    title: Optional[str] = Field(None, min_length=1)
    url: Optional[str] = None
    note: Optional[str] = None


class SkillWrite(BaseModel):
    """POST /skills"""
    name: str = Field(..., description="技能名称，同一用户内唯一")
    proficiency: Proficiency = Field(..., description="熟练程度")
    sort_order: int = Field(0, description="展示顺序")


class SkillRead(SkillWrite):
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="资源 id")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class SkillPatch(BaseModel):
    """PATCH /skills/{id}：部分更新"""
    name: Optional[str] = Field(None, min_length=1)
    proficiency: Optional[Proficiency] = None
    sort_order: Optional[int] = None


class ProjectSkillsSet(BaseModel):
    """PUT /projects/{id}/skills：整体替换关联（04 §5.2，后端事务内先删后建）"""
    skill_ids: List[str] = Field(..., description="该项目关联的完整技能 id 列表")


# ---------------------------------------------------------------------------
# 项目表达（M3 产物，生成走 Agent 任务协议）
# ---------------------------------------------------------------------------

class ExpressionGenerate(BaseModel):
    """POST /projects/{id}/expressions（202；重新生成 = 再次 POST，版本号自增，无覆盖）"""
    type: ExpressionType = Field(..., description="生成哪种场景表达 resume_bullet / interview / star")


class ProjectExpressionRead(BaseModel):
    """GET /projects/{id}/expressions 列表项与 PATCH 后回显"""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="表达 id")
    project_id: str = Field(..., description="所属项目 id")
    type: ExpressionType = Field(..., description="场景")
    version_number: int = Field(..., description="该 (project, type) 组合下的版本号，最大者为当前")
    content: dict = Field(..., description="表达内容，结构见 02 §6.3")
    status: ExpressionStatus = Field(..., description="draft / confirmed")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class ProjectExpressionUpdate(BaseModel):
    """PATCH /project-expressions/{id}：确认或编辑（可同时带上）"""
    content: Optional[dict] = Field(None, description="编辑后的内容，整体替换该版本")
    status: Optional[ExpressionStatus] = Field(None, description="置 confirmed 确认（Human-in-the-loop）")


# ---------------------------------------------------------------------------
# AI 辅助填写（两段式，无状态多轮，04 决策 #4）
# ---------------------------------------------------------------------------

class AnswerItem(BaseModel):
    """第一段问卷的单条作答"""
    question: str = Field(..., description="问题原文")
    answer: str = Field(..., description="作答内容")


class AssistQuestionnaireRequest(BaseModel):
    """POST /projects/{id}/assist/questionnaire（202，done.result.follow_up 为追问）"""
    answers: List[AnswerItem] = Field(..., min_length=1, description="第一段问卷全部作答")


class ChatMessage(BaseModel):
    """对话消息，前端持历史、每轮全量发送"""
    role: Literal["user", "assistant"] = Field(..., description="发言方")
    content: str = Field(..., description="消息内容")


class AssistMessagesRequest(BaseModel):
    """POST /projects/{id}/assist/messages（202，chunk 流式回复）"""
    messages: List[ChatMessage] = Field(..., min_length=1, description="完整对话历史")


class AssistRefillRequest(AssistMessagesRequest):
    """POST /projects/{id}/assist/refill（202）：STOP 并回填，
    done.result.fields 为六个字段的提炼建议，用户确认后走普通 PATCH（04 §5.2）"""
    pass