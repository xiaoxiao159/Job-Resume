'''
LLM 结构化输出契约（02 §6 JSONB 结构与 05 §4 各 Agent 输出 Schema 一一对应）：

「数据库永不写入未校验的 LLM 输出」（05 决定 #4）——每个结构化任务
在落库前必须通过这里的 Pydantic 校验。10 任务输出契约全集。

数值评分（overall_score / match_score）一律程序计算（05 决定 #8），
任何任务的本层输出都不含分数字段。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class JdSkillItem(BaseModel):
    '''JD 技能条目（02 §6.2）'''
    name: str = Field(..., description="技能名，保留 JD 原文写法")
    stars: int = Field(..., ge=1, le=5, description="星级：核心 4~5 / 加分 1~3")


class JdAnalysisOutput(BaseModel):
    '''jd_analyze 输出（05 §4.1 / 02 §6.2 岗位画像）'''
    title: str = Field(..., description="岗位名称")
    core_skills: list[JdSkillItem] = Field(default_factory=list, description="核心技能（JD 必须项，stars 4~5）")
    plus_skills: list[JdSkillItem] = Field(default_factory=list, description="加分项（nice-to-have，stars 1~3）")
    responsibilities: list[str] = Field(default_factory=list, description="岗位职责（动作短语）")
    experience_requirement: str = Field(default="", description="经验要求")
    education_requirement: str = Field(default="", description="学历要求")
    keywords: list[str] = Field(default_factory=list, description="简历命中关键词")


# ---------------------------------------------------------------------------
# jd_match（05 §4.2）：LLM 只做三态分类，overall_score 程序算（scoring.py）
# ---------------------------------------------------------------------------

class SkillMatchItem(BaseModel):
    '''单个 JD 技能的匹配判定（05 §4.2）；matched_asset 仅辅助审计，落库时剥离（02 §6.4 无此字段）'''
    name: str = Field(..., description="JD 技能名（与画像完全一致）")
    status: Literal["strong", "partial", "missing"] = Field(..., description="三态判定")
    matched_asset: Optional[str] = Field(None, description="命中的资产说明（如「技能 Python(expert)」），missing 为 null")


class JdMatchOutput(BaseModel):
    '''jd_match 输出（05 §4.2 / 02 §6.4，不含 overall_score）'''
    skill_matches: List[SkillMatchItem] = Field(default_factory=list, description="每个 JD 技能恰好一条，覆盖 core+plus 全部")
    matched_project_ids: List[str] = Field(default_factory=list, description="相关项目 UUID")
    advantages: List[str] = Field(default_factory=list, description="你的优势")
    gaps: List[str] = Field(default_factory=list, description="你的不足")


# ---------------------------------------------------------------------------
# project_expression（05 §4.3）：结构随 type 三态（02 §6.3）
# ---------------------------------------------------------------------------

class ResumeBulletOutput(BaseModel):
    '''resume_bullet 版输出：1~3 条，每条 ≤ 40 字'''
    bullets: List[str] = Field(..., min_length=1, max_length=3)


class InterviewOutput(BaseModel):
    '''interview 版输出：六段，每段 100~200 字'''
    background: str
    responsibility: str
    architecture: str
    difficulty: str
    solution: str
    result: str


class StarOutput(BaseModel):
    '''star 版输出：严格四段'''
    situation: str
    task: str
    action: str
    result: str


# ---------------------------------------------------------------------------
# resume_generate（05 §4.4）：LLM 只输出认知三件，事实段由程序组装
# ---------------------------------------------------------------------------

class ProjectBulletOutput(BaseModel):
    '''单个项目的 bullets 输出；name/period/role/tech_stack 等事实字段不经过 LLM'''
    id: str = Field(..., description="项目 UUID（装配时提供）")
    bullets: List[str] = Field(..., min_length=1, description="简历 bullet（优先取 confirmed 表达原文）")


class ResumeGenerateOutput(BaseModel):
    '''resume_generate 输出（05 §4.4 装配分工）'''
    projects: List[ProjectBulletOutput] = Field(default_factory=list, description="顺序即简历顺序（JD 相关在前）")
    skill_order: List[str] = Field(default_factory=list, description="全量技能名重排序（按 JD 相关性，名称与资产库一致）")
    self_evaluation: Optional[str] = Field(None, description="JD 化改写的自我评价；无可改写依据为 null")


# ---------------------------------------------------------------------------
# reflection（05 §4.5）：LLM 自检 issues + 关键词覆盖分类；match_score 程序算
# ---------------------------------------------------------------------------

class FabricationIssue(BaseModel):
    '''单条编造嫌疑（02 §6.5）'''
    location: str = Field(..., description="定位，如 projects[0].bullets[1]")
    claim: str = Field(..., description="嫌疑表述原文")
    type: Literal["number_not_in_assets", "tech_not_in_assets", "project_not_in_assets", "other"] = Field(...)


class ReflectionOutput(BaseModel):
    '''reflection 输出（05 §4.5 ②）：issues 为空 = LLM 侧通过；
    程序校验命中项（reflection_checks.py）在落库时合并'''
    issues: List[FabricationIssue] = Field(default_factory=list)
    hit_keywords: List[str] = Field(default_factory=list, description="简历已覆盖的 JD 关键词")
    missing_keywords: List[str] = Field(default_factory=list, description="未覆盖的 JD 关键词")


# ---------------------------------------------------------------------------
# assist_refill（05 §4.7）：六/七个认知字段的提炼建议（无表，done.result.fields）
# ---------------------------------------------------------------------------

class RefillFieldsOutput(BaseModel):
    '''assist_refill 输出：字段值与对话事实一致，无支撑不写（空串）。
    七字段 = 前端 RefillFields 契约（04 §5.2 原文为六字段无 core_work，以前端契约为准，07 §15）'''
    background: str = ""
    goal: str = ""
    responsibilities: str = ""
    core_work: str = ""
    difficulties: str = ""
    solutions: str = ""
    results: str = ""
