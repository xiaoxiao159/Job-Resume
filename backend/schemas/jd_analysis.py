'''
JD 模块 DTO（04 §5.3 / 前端 jd.ts 契约）：

- JobDescriptionRead 多出前端契约字段 latest_match_score（列表/详情都带）：
  该 JD 最新一次 jd_match 的 overall_score（无匹配记录为 null）——DB 不落列，查询时子查询带出
- getAnalysis（GET /job-descriptions/{id}/analysis）前端契约为 JDAnalysis | null：
  无分析行时返回 {"data": null} 而非 404（前端 mock 同语义，07 §15 契约差异 #4）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from backend.database.models import AnalysisStatus


class JobDescriptionWrite(BaseModel):
    '''POST 创建（前端 createJD：title/company 可选，raw_text 必填）'''
    title: Optional[str] = None
    company: Optional[str] = None
    raw_text: str = Field(..., min_length=1, description="JD 原文")


class JobDescriptionPatch(BaseModel):
    '''PATCH 部分更新（04 §4：?PATCH body = 表字段子集）'''
    title: Optional[str] = None
    company: Optional[str] = None
    raw_text: Optional[str] = Field(None, min_length=1)


class JobDescriptionRead(BaseModel):
    id: str
    title: Optional[str]
    company: Optional[str]
    raw_text: str
    created_at: datetime
    latest_match_score: Optional[float] = None   # 查询带出（子查询），非表列


class JDAnalysisRead(BaseModel):
    '''岗位画像（02 §6.2）；processing 期间内容字段为 null，前端骨架屏（04 §5.3）'''
    id: str
    jd_id: str
    status: AnalysisStatus
    title: Optional[str] = None
    core_skills: Optional[list] = None
    plus_skills: Optional[list] = None
    responsibilities: Optional[list] = None
    experience_requirement: Optional[str] = None
    education_requirement: Optional[str] = None
    keywords: Optional[list] = None
    created_at: datetime


class SkillMatchRead(BaseModel):
    '''02 §6.4 skill_matches 列表项：{name, status}（matched_asset 仅任务内部用，不落库不出参）'''
    name: str
    status: str = Field(..., description="strong / partial / missing")


class JDMatchRead(BaseModel):
    '''匹配结果（02 §6.4；overall_score 由 scoring.py 程序计算，LLM 不产出分数）'''
    id: str
    jd_id: str
    overall_score: int = Field(..., description="0-100，程序计算")
    skill_matches: List[SkillMatchRead]
    matched_project_ids: List[str] = Field(default_factory=list)
    advantages: List[str] = Field(default_factory=list)
    gaps: List[str] = Field(default_factory=list)
    created_at: datetime