'''
数据模型：19 张表（依据 design/02-data-model.md v0.3，已确认）

通用约定（02 §4）：
- 主键 UUID，PG 端 gen_random_uuid() 生成（需要 PostgreSQL 13+，内置函数）
- 所有表含 created_at TIMESTAMPTZ DEFAULT now()；可变数据表含 updated_at，由 ORM onupdate 维护
- 文本一律 TEXT；枚举实现为 VARCHAR + CHECK（决策 #10：不用 PG 原生 ENUM，避免 ALTER TYPE 迁移成本）
- LLM 半结构化输出一律 JSONB（决策 #4），内容带 schema_version 字段
- 索引见 02 §7.1；删除策略见 02 §7.2（FK ondelete 已按该表实现）
- 产物：resume_versions = 简历版本快照 + Reflection；suite 关系见每类 docstring

注意：导入统一用 `backend.` 前缀，运行时以仓库根为根（uvicorn backend.main:app）；
顶部 sys.path 注入仓库根，IDE 直跑单文件时 `backend.` 也能解析。
'''
from __future__ import annotations
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PG_UUID
from sqlalchemy.ext.associationproxy import association_proxy
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database.session import Base

# ---------------------------------------------------------------------------
# 枚举（02 §5）：值名即落库值，TEXT + CHECK 实现
# ---------------------------------------------------------------------------

class Availability(str, enum.Enum):
    '''到岗时间'''
    immediate = "immediate"                # 立即到岗
    within_1_week = "within_1_week"        # 一周内
    within_2_weeks = "within_2_weeks"      # 两周内
    within_1_month = "within_1_month"      # 一个月内
    undecided = "undecided"                # 待定


class Degree(str, enum.Enum):
    '''学历阶段（数据库 CHECK 与 API 均用成员名 slug；中文展示放前端映射层）'''
    bachelor = "bachelor"
    master = "master"
    phd = "phd"


class ExperienceType(str, enum.Enum):
    '''经历类型'''
    research = "research"                  # 科研
    campus = "campus"                      # 校园


class Proficiency(str, enum.Enum):
    '''技能熟练度'''
    beginner = "beginner"                  # 了解
    familiar = "familiar"                  # 熟悉
    proficient = "proficient"              # 熟练
    expert = "expert"                      # 精通


class EvidenceType(str, enum.Enum):
    '''证据类型（PRD §3.1 Evidence First）'''
    github = "github"
    code = "code"
    doc = "doc"
    experiment = "experiment"
    screenshot = "screenshot"
    demo = "demo"
    paper = "paper"
    other = "other"


class ExpressionType(str, enum.Enum):
    '''项目表达场景（F3.2）'''
    resume_bullet = "resume_bullet"        # 简历版
    interview = "interview"                # 面试版
    star = "star"                          # STAR 版


class ExpressionStatus(str, enum.Enum):
    '''表达状态（Human-in-the-loop）'''
    draft = "draft"
    confirmed = "confirmed"


class AnalysisStatus(str, enum.Enum):
    '''JD 分析异步状态'''
    processing = "processing"
    completed = "completed"
    failed = "failed"


class SkillMatchStatus(str, enum.Enum):
    '''技能匹配状态——仅 jd_matches JSON 内使用，不落列为 CHECK'''
    strong = "strong"
    partial = "partial"
    missing = "missing"


class ResumeTemplate(str, enum.Enum):
    '''简历模板（F5.3）'''
    classic = "classic"
    modern = "modern"
    minimal = "minimal"


class ReflectionStatus(str, enum.Enum):
    '''Reflection 验证状态（F4.5）'''
    pending = "pending"
    passed = "passed"
    issues = "issues"


class HrScene(str, enum.Enum):
    '''HR 开场白场景（F6.1）'''
    boss_zhipin = "boss_zhipin"            # Boss直聘
    wechat = "wechat"                      # 微信
    email = "email"                        # 邮件
    linkedin = "linkedin"


class HrMode(str, enum.Enum):
    '''HR 开场白版本（F6.2）'''
    short = "short"                        # 简短版
    standard = "standard"                  # 标准版
    technical = "technical"                # 技术版


class ApplicationStatus(str, enum.Enum):
    '''投递状态（PRD §12.3 状态机）'''
    to_apply = "to_apply"                  # 待投递
    applied = "applied"                    # 已投递
    replied = "replied"                    # 已回复
    interview = "interview"                # 面试
    offer = "offer"
    rejected = "rejected"                  # 拒绝
    no_response = "no_response"            # 无回复


class AgentRunStatus(str, enum.Enum):
    '''Agent 执行状态'''
    running = "running"
    completed = "completed"
    failed = "failed"


def checked_enum(py_enum: type[enum.Enum]) -> Enum:
    '''VARCHAR + CHECK 枚举（02 决策 #10），非法值赋值会被 ORM 拒绝'''
    # 注意：native_enum=False 时 SQLAlchemy 不会自动建 CHECK（2.0.52 实测），
    # 必须显式 create_constraint=True，否则只剩 VARCHAR 没有任何值约束
    return Enum(py_enum, native_enum=False, validate_strings=True, create_constraint=True)


# ---------------------------------------------------------------------------
# 通用约定：主键与时间戳在各表内显式书写（学习可读性优先，不做 mixin 抽象）
# ---------------------------------------------------------------------------
# M1 Career Assets 资产库（10 张）
# ---------------------------------------------------------------------------

class User(Base):
    '''单用户模式：固定一行默认用户，表结构预留多用户演进（决策 #14）'''
    __tablename__ = "users"  # 不用 "user"：PG 保留字，需整天加引号

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True, comment="登录标识；单用户模式下占位")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    basic_info: Mapped["BasicInfo"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")#1:1
    educations: Mapped[list["Education"]] = relationship(back_populates="user", cascade="all, delete-orphan", order_by="Education.sort_order")#1:N
    experiences: Mapped[list["Experience"]] = relationship(back_populates="user", cascade="all, delete-orphan", order_by="Experience.sort_order")#1:N
    honors: Mapped[list["Honor"]] = relationship(back_populates="user", cascade="all, delete-orphan", order_by="Honor.sort_order")#1:N
    projects: Mapped[list["Project"]] = relationship(back_populates="user", cascade="all, delete-orphan", order_by="Project.sort_order")#1:N
    skills: Mapped[list["Skill"]] = relationship(back_populates="user", cascade="all, delete-orphan", order_by="Skill.sort_order")#1:N
    job_descriptions: Mapped[list["JobDescription"]] = relationship(back_populates="user", cascade="all, delete-orphan")#1:N
    resumes: Mapped[list["Resume"]] = relationship(back_populates="user", cascade="all, delete-orphan")#1:N
    hr_messages: Mapped[list["HrMessage"]] = relationship(back_populates="user", cascade="all, delete-orphan")#1:N
    applications: Mapped[list["Application"]] = relationship(back_populates="user", cascade="all, delete-orphan")#1:N
    interview_qas: Mapped[list["InterviewQA"]] = relationship(back_populates="user", cascade="all, delete-orphan")#1:N
    agent_runs: Mapped[list["AgentRun"]] = relationship(back_populates="user", cascade="all, delete-orphan")#1:N


class BasicInfo(Base):
    '''基本信息与求职意向（§4.2），与 users 1:1'''
    __tablename__ = "basic_info"

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, comment="UNIQUE 保证 1:1")
    name: Mapped[str] = mapped_column(Text, nullable=False, comment="姓名")
    email: Mapped[str] = mapped_column(Text, nullable=False, comment="简历展示邮箱，可与登录邮箱不同")
    phone: Mapped[str] = mapped_column(Text, nullable=False)
    github_url: Mapped[str] = mapped_column(Text, nullable=False)
    homepage_url: Mapped[str | None] = mapped_column(Text, comment="个人主页，可选")
    job_role: Mapped[str | None] = mapped_column(Text, comment="意向岗位（F1.1，参与 JD Match 提示）")
    city: Mapped[str | None] = mapped_column(Text, comment="意向城市")
    availability: Mapped[Availability | None] = mapped_column(checked_enum(Availability), comment="到岗时间")
    self_evaluation: Mapped[str | None] = mapped_column(Text, comment="自我评价（F1.8，简历第 8 段来源）")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="basic_info")


class Education(Base):
    '''教育背景（§4.3 / F1.5），可多条'''
    __tablename__ = "educations"
    __table_args__ = (
        Index("ix_educations_user_sort_order", "user_id", "sort_order"),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    school: Mapped[str] = mapped_column(Text, nullable=False)
    major: Mapped[str] = mapped_column(Text, nullable=False)
    degree: Mapped[Degree] = mapped_column(checked_enum(Degree), nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, comment="在读可空")
    courses: Mapped[str | None] = mapped_column(Text, comment="主修课程，可选补充")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="educations")


class Experience(Base):
    '''科研 / 校园经历（§4.4 / F1.6），结构相同合并一张表（决策 #2）'''
    __tablename__ = "experiences"
    __table_args__ = (
        Index("ix_experiences_user_sort_order", "user_id", "sort_order"),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[ExperienceType] = mapped_column(checked_enum(ExperienceType), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False, comment="经历名称")
    role: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="experiences")


class Project(Base):
    '''项目资产（§4.5），核心数据源；字段即「通用版表达」（决策 #3，不单独建表）'''
    __tablename__ = "projects"
    __table_args__ = (
        Index("ix_projects_user_sort_order", "user_id", "sort_order"),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, comment="项目简介")
    background: Mapped[str | None] = mapped_column(Text, comment="项目背景")
    goal: Mapped[str | None] = mapped_column(Text, comment="项目目标")
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    role: Mapped[str | None] = mapped_column(Text, comment="项目角色")
    tech_stack: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default=text("'{}'::text[]"), default=list, comment="技术栈清单（展示用）；带熟练度的技能在 skills 表（决策 #13）")
    responsibilities: Mapped[str | None] = mapped_column(Text, comment="个人职责")
    core_work: Mapped[str | None] = mapped_column(Text, comment="核心工作")
    difficulties: Mapped[str | None] = mapped_column(Text, comment="技术难点")
    solutions: Mapped[str | None] = mapped_column(Text, comment="解决方案")
    results: Mapped[str | None] = mapped_column(Text, comment="项目成果")
    github_url: Mapped[str | None] = mapped_column(Text)
    demo_url: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="projects")
    evidence: Mapped[list["Evidence"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    project_expressions: Mapped[list["ProjectExpression"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    project_skills: Mapped[list["ProjectSkill"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    # 便捷访问：project.skills 直接返回技能列表（append/remove 自动维护关联行）
    skills = association_proxy("project_skills", "skill")


class Skill(Base):
    '''技能（§4.6 / F1.4），带熟练度，供 JD 匹配用'''
    __tablename__ = "skills"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_skills_user_id_name"),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    proficiency: Mapped[Proficiency] = mapped_column(checked_enum(Proficiency), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="skills")
    project_skills: Mapped[list["ProjectSkill"]] = relationship(back_populates="skill", cascade="all, delete-orphan")
    projects = association_proxy("project_skills", "project")


class ProjectSkill(Base):
    '''技能-项目关联（§4.7），多对多；主键即关联本身'''
    __tablename__ = "project_skills"
    __table_args__ = (
        Index("ix_project_skills_skill_id", "skill_id"),  # 复合主键已覆盖 project_id 前缀查询
    )

    project_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    skill_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="project_skills")
    skill: Mapped["Skill"] = relationship(back_populates="project_skills")


class Evidence(Base):
    '''证据（§4.8 / PRD §3.1 Evidence First），挂在项目上'''
    __tablename__ = "evidence"

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    project_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[EvidenceType] = mapped_column(checked_enum(EvidenceType), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False, comment="展示名，如「GitHub 仓库」")
    url: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="evidence")


class Honor(Base):
    '''荣誉证书（§4.9 / F1.7），时间用自由文本（MVP 不做日期结构化）'''
    __tablename__ = "honors"
    __table_args__ = (
        Index("ix_honors_user_sort_order", "user_id", "sort_order"),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False, comment="证书/荣誉名称")
    time: Mapped[str | None] = mapped_column(Text, comment="自由时间串，如「2026 年 6 月」")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="honors")


class ProjectExpression(Base):
    '''项目求职场景表达（§4.10 / M3·F3.2），保留历史、按 (project, type, version_number) 归档

    取用规则：Resume Agent 优先取该 (project, type) 下最新的 confirmed；
    无 confirmed 时取最新草稿（当前版本 = version_number 最大者）。
    '''
    __tablename__ = "project_expressions"
    __table_args__ = (
        UniqueConstraint("project_id", "type", "version_number", name="uq_project_expressions_project_type_version"),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    project_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[ExpressionType] = mapped_column(checked_enum(ExpressionType), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, comment="该 (project, type) 组合下递增 1, 2, 3… 由应用层计算")
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, comment="见 02 §6.3：resume_bullet/interview/star 各有其结构，含 schema_version")
    status: Mapped[ExpressionStatus] = mapped_column(checked_enum(ExpressionStatus), nullable=False, server_default=text("'draft'"), comment="用户确认后置 confirmed（Human-in-the-loop）")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="project_expressions")


# ---------------------------------------------------------------------------
# M2 JD Analysis（3 张）
# ---------------------------------------------------------------------------

class JobDescription(Base):
    '''JD 原文（§4.11 / F2.1），MVP 仅粘贴文本'''
    __tablename__ = "job_descriptions"
    __table_args__ = (
        Index("ix_job_descriptions_user_created", "user_id", text("created_at DESC")),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str | None] = mapped_column(Text, comment="用户命名；缺省取分析结果岗位名")
    company: Mapped[str | None] = mapped_column(Text, comment="可选，投递时引用")
    raw_text: Mapped[str] = mapped_column(Text, nullable=False, comment="JD 原文")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="job_descriptions")
    analysis: Mapped["JDAnalysis"] = relationship(back_populates="jd", uselist=False, cascade="all, delete-orphan")
    matches: Mapped[list["JDMatch"]] = relationship(back_populates="jd", cascade="all, delete-orphan", order_by="JDMatch.created_at.desc()")
    resume_versions: Mapped[list["ResumeVersion"]] = relationship(back_populates="jd")  # 无 cascade：删 JD 时该列置 NULL
    hr_messages: Mapped[list["HrMessage"]] = relationship(back_populates="jd")  # 同上


class JDAnalysis(Base):
    '''JD 分析结果（§4.12 / F2.2），与 JD 1:1，异步分析写入'''
    __tablename__ = "jd_analyses"

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    jd_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("job_descriptions.id", ondelete="CASCADE"), nullable=False, unique=True)
    status: Mapped[AnalysisStatus] = mapped_column(checked_enum(AnalysisStatus), nullable=False, server_default=text("'processing'"))
    title: Mapped[str | None] = mapped_column(Text, comment="岗位名称识别")
    core_skills: Mapped[dict | None] = mapped_column(JSONB, comment="核心技能含星级，见 02 §6.2")
    plus_skills: Mapped[dict | None] = mapped_column(JSONB, comment="加分项")
    responsibilities: Mapped[dict | None] = mapped_column(JSONB, comment="岗位职责 text[]")
    experience_requirement: Mapped[str | None] = mapped_column(Text, comment="经验要求")
    education_requirement: Mapped[str | None] = mapped_column(Text, comment="学历要求")
    keywords: Mapped[dict | None] = mapped_column(JSONB, comment="关键词 text[]")
    error: Mapped[str | None] = mapped_column(Text, comment="失败原因")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    jd: Mapped["JobDescription"] = relationship(back_populates="analysis")


class JDMatch(Base):
    '''岗位匹配结果（§4.13 / F2.3·F2.4），每次匹配留档（决策 #6）

    最新结果 = 该 jd_id 下 created_at 最大者；历史留档支撑资产增长的匹配度观察。
    '''
    __tablename__ = "jd_matches"
    __table_args__ = (
        Index("ix_jd_matches_jd_created", "jd_id", text("created_at DESC")),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    jd_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("job_descriptions.id", ondelete="CASCADE"), nullable=False)
    overall_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), comment="总体匹配度（如 87），冗余为列便于 SQL 排序统计")
    skill_matches: Mapped[dict | None] = mapped_column(JSONB, comment="三类清单，见 02 §6.4")
    matched_project_ids: Mapped[dict | None] = mapped_column(JSONB, comment="相关项目 UUID[]")
    advantages: Mapped[dict | None] = mapped_column(JSONB, comment="你的优势 text[]")
    gaps: Mapped[dict | None] = mapped_column(JSONB, comment="你的不足 text[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    jd: Mapped["JobDescription"] = relationship(back_populates="matches")


# ---------------------------------------------------------------------------
# M4 Resume Agent / M5 Resume Studio（2 张）
# ---------------------------------------------------------------------------

class Resume(Base):
    '''简历（§4.14 / F4.2·F5.1），按目标岗位分类；同一岗位一份，版本在 resume_versions'''
    __tablename__ = "resumes"
    __table_args__ = (
        UniqueConstraint("user_id", "target_role", name="uq_resumes_user_target_role"),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False, comment="显示名")
    target_role: Mapped[str] = mapped_column(Text, nullable=False, comment="目标岗位分类（分组键，如「AI 应用工程师」）")
    template: Mapped[ResumeTemplate | None] = mapped_column(checked_enum(ResumeTemplate), comment="选定模板后非空（F5.3）")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="resumes")
    versions: Mapped[list["ResumeVersion"]] = relationship(back_populates="resume", cascade="all, delete-orphan", order_by="ResumeVersion.version_number")


class ResumeVersion(Base):
    '''简历版本（§4.15 / F4.2·F4.5），内容快照 + Reflection

    生命周期（04-api-design §5.4）：pending（可编辑，快照语义未生效）
    → reflect 后 passed / issues → confirm 定稿（confirmed_at 落时间，content 锁定）。
    投递仅引用定稿版；未定稿重新生成产生 v+1，本版本不动。
    '''
    __tablename__ = "resume_versions"
    __table_args__ = (
        UniqueConstraint("resume_id", "version_number", name="uq_resume_versions_resume_version"),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    resume_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, comment="递增 1, 2, 3…（展示为 v1 / v2），由应用层计算")
    jd_id: Mapped[str | None] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("job_descriptions.id", ondelete="SET NULL"), index=True, comment="定制依据；Master 版为空")
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, comment="8 段完整内容快照，见 02 §6.1")
    reflection_status: Mapped[ReflectionStatus] = mapped_column(checked_enum(ReflectionStatus), nullable=False, server_default=text("'pending'"))
    reflection_result: Mapped[dict | None] = mapped_column(JSONB, comment="匹配度 + 编造检查，见 02 §6.5")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now(), comment="pending 期内容编辑时更新；定稿后不再变化")
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), comment="定稿时间；非空即锁定——content 拒绝写入（API 409 locked_version）")

    resume: Mapped["Resume"] = relationship(back_populates="versions")
    jd: Mapped["JobDescription"] = relationship(back_populates="resume_versions")
    applications: Mapped[list["Application"]] = relationship(back_populates="resume_version")  # 无 cascade：删版本时置 NULL，投递记录保留
    hr_messages: Mapped[list["HrMessage"]] = relationship(back_populates="resume_version")  # 同上


# ---------------------------------------------------------------------------
# M6 HR 开场白 / M7 投递 / M8 面试（3 张）
# ---------------------------------------------------------------------------

class HrMessage(Base):
    '''HR 开场白（§4.16 / F6），生成后可编辑保存'''
    __tablename__ = "hr_messages"
    __table_args__ = (
        Index("ix_hr_messages_user_jd", "user_id", "jd_id"),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    jd_id: Mapped[str | None] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("job_descriptions.id", ondelete="SET NULL"), comment="依据 JD，可空")
    resume_version_id: Mapped[str | None] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("resume_versions.id", ondelete="SET NULL"))
    scene: Mapped[HrScene] = mapped_column(checked_enum(HrScene), nullable=False)
    mode: Mapped[HrMode] = mapped_column(checked_enum(HrMode), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="文案正文")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="hr_messages")
    jd: Mapped["JobDescription"] = relationship(back_populates="hr_messages")
    resume_version: Mapped["ResumeVersion"] = relationship(back_populates="hr_messages")


class Application(Base):
    '''投递记录（§4.17 / F7），极简表格；状态机见 ApplicationStatus'''
    __tablename__ = "applications"
    __table_args__ = (
        Index("ix_applications_user_status", "user_id", "status"),
        Index("ix_applications_user_applied_at", "user_id", text("applied_at DESC")),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    company: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ApplicationStatus] = mapped_column(checked_enum(ApplicationStatus), nullable=False, server_default=text("'to_apply'"))
    applied_at: Mapped[date | None] = mapped_column(Date, comment="投递时间，待投递为空")
    resume_version_id: Mapped[str | None] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("resume_versions.id", ondelete="SET NULL"), index=True, comment="使用的简历版本（F7.3，A/B 测试基础）")
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="applications")
    resume_version: Mapped["ResumeVersion"] = relationship(back_populates="applications")
    interview_qas: Mapped[list["InterviewQA"]] = relationship(back_populates="application")  # 无 cascade：删投递时置 NULL


class InterviewQA(Base):
    '''面试问题记录（§4.18 / M8·F8）；冗余 company/position 支持按公司分组（决策 #11）'''
    __tablename__ = "interview_qa"
    __table_args__ = (
        Index("ix_interview_qa_user_company", "user_id", "company"),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    application_id: Mapped[str | None] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("applications.id", ondelete="SET NULL"), index=True, comment="关联投递（F8.3），自动带出岗位")
    company: Mapped[str] = mapped_column(Text, nullable=False, comment="冗余自投递记录")
    position: Mapped[str | None] = mapped_column(Text, comment="冗余，关联时自动带出")
    interview_at: Mapped[date | None] = mapped_column(Date, comment="面试时间")
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, comment="我的回答")
    note: Mapped[str | None] = mapped_column(Text, comment="复盘备注")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="interview_qas")
    application: Mapped["Application"] = relationship(back_populates="interview_qas")


# ---------------------------------------------------------------------------
# 横切（1 张）
# ---------------------------------------------------------------------------

class AgentRun(Base):
    '''Agent 执行日志（§4.19），可观测性；只增不改，无 updated_at'''
    __tablename__ = "agent_runs"
    __table_args__ = (
        Index("ix_agent_runs_user_created", "user_id", text("created_at DESC")),
        Index("ix_agent_runs_agent_type_created", "agent_type", text("created_at DESC")),
    )

    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    agent_type: Mapped[str] = mapped_column(Text, nullable=False, comment="jd_agent / project_agent / resume_agent / hr_agent / asset_assist")
    prompt_name: Mapped[str | None] = mapped_column(Text, comment="backend/prompts/ 下模板名")
    model: Mapped[str | None] = mapped_column(Text, comment="所用模型")
    status: Mapped[AgentRunStatus] = mapped_column(checked_enum(AgentRunStatus), nullable=False, server_default=text("'running'"))
    input_refs: Mapped[dict | None] = mapped_column(JSONB, comment="{jd_id, project_id, resume_version_id, …}")
    output_refs: Mapped[dict | None] = mapped_column(JSONB, comment="产出的实体引用")
    error: Mapped[str | None] = mapped_column(Text)
    feedback: Mapped[str | None] = mapped_column(Text, comment="👍/👎 反馈（03 §4.1），up / down；02 v0.4 补列")  # noqa: E501
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="agent_runs")