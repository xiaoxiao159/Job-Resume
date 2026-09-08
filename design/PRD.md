# AI Job Copilot — 产品需求文档

> **定位**：面向 AI / 互联网求职者的 AI 简历与求职辅助平台  
> **版本**：v0.4 · MVP 产品基线  
> **状态**：产品设计阶段  
> **更新日期**：2026-09-04
> **变更**：§5 主流程二段化（资产准备 / 求职定制，Project Agent 前置）；§6 Career Assets 扩展（Basic Info 求职意向、教育 / 科研 / 校园 / 荣誉 / 自我评价）；§11 简历内容结构（8 段）；§12 面试 QA 记录

---

## 目录

- [1. 产品概述](#1-产品概述)
- [2. 产品目标](#2-产品目标)
- [3. 核心设计原则](#3-核心设计原则)
- [4. MVP 功能范围](#4-mvp-功能范围)
- [5. 核心用户流程](#5-核心用户流程)
- [6. Career Assets 个人求职资产](#6-career-assets-个人求职资产)
- [7. JD Analysis JD 分析](#7-jd-analysis-jd-分析)
- [8. Resume Agent 简历 Agent](#8-resume-agent-简历-agent)
- [9. Project Agent 项目 Agent](#9-project-agent-项目-agent)
- [10. HR Agent 沟通 Agent](#10-hr-agent-沟通-agent)
- [11. Resume Studio 简历工作台](#11-resume-studio-简历工作台)
- [12. Application Log 投递记录](#12-application-log-投递记录)
- [13. Agent 架构](#13-agent-架构)
- [14. 数据模型](#14-数据模型)
- [15. 前端页面](#15-前端页面)
- [16. MVP 验收标准](#16-mvp-验收标准)
- [17. V2 / V3 规划](#17-v2--v3-规划)
- [18. 项目最终定位](#18-项目最终定位)

---

# 1. 产品概述

## 1.1 产品定位

**AI Job Copilot** 是一个面向 AI / 互联网求职者的 AI 简历与求职辅助平台。

它不是单纯的「AI 简历润色工具」，而是围绕：

> **个人项目与技能资产 → JD 分析 → 岗位匹配 → 项目润色 → 简历定制 →  HR 沟通 → 投递记录**

形成一个轻量、完整的求职辅助闭环。

### 核心定位

```text
┌──────────────────────────────────────────────┐
│                AI Job Copilot               │
│                                              │
│   我的项目 + 技能                            │
│          ↓                                   │
│        JD 分析                                │
│          ↓                                   │
│      岗位匹配分析                             │
│          ↓                                   │
│   ┌──────┴──────┐                            │
│   ↓             ↓                            │
│ 简历定制      项目润色                         │
│   ↓             ↓                            │
│   └──────┬──────┘                            │
│          ↓                                   │
│      HTML / PDF 简历                          │
│          ↓                                   │
│       HR 开场白                               │
│          ↓                                   │
│       投递记录                                │
└──────────────────────────────────────────────┘
```

---

# 2. 产品目标

## 2.1 解决的问题

### 问题一：一份简历投所有岗位

用户通常只有一份通用简历：

```text
通用简历
   ↓
投递不同岗位
   ↓
岗位匹配度不高
```

AI Job Copilot 将其转化为：

```text
JD + 我的项目 + 我的技能
            ↓
       JD 分析 / 匹配
            ↓
        定制化简历
```

---

### 问题二：项目做得出来，但不会包装

用户往往知道：

- 做了什么
- 使用了什么技术

但不容易表达：

- 为什么做
- 解决了什么问题
- 核心难点是什么
- 自己具体负责什么
- 最终产生了什么结果

Project Agent 帮助用户将原始项目经历转化为：

> **专业、真实、适合求职场景的项目表达。**

---

### 问题三：投递以后缺乏反馈

传统求职过程：

```text
投递 → 等待 → 忘记
```

产品将其记录为：

```text
投递 → 回复 → 面试 → Offer
```

并保留最基本的统计数据，为后续扩展数据分析能力提供基础。

---

# 3. 核心设计原则

## 3.1 Evidence First：以事实和证据为基础

简历是求职材料，**真实性优先于“包装效果”**。

建立：

```text
Fact → Claim → Evidence
```

例如用户事实：

> 使用 LangGraph 构建 Agent。

可以生成：

> 基于 LangGraph 构建 Agent Workflow，实现多节点任务的模块化编排。

但不能在没有证据的情况下生成：

> 将系统性能提升 50%。

---

### 证据类型

可以关联：

```text
GitHub
代码
项目文档
实验结果
项目截图
Demo
论文
其他证明材料
```

---

## 3.2 一份经历，多种表达

同一个项目可以针对不同岗位生成不同版本：

```text
                    原始项目
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
      AI应用工程师   Agent工程师   后端开发
          ↓            ↓            ↓
      不同侧重点     不同侧重点     不同侧重点
```

核心原则：

> **改变表达方式，而不是编造经历。**

---

## 3.3 LLM 负责认知，程序负责确定性

不是所有功能都需要 Agent。

### LLM / Agent 负责

```text
理解
分析
匹配
改写
生成
推荐
```

### Backend 负责

```text
计算
查询
保存
状态管理
数据校验
权限
事务
```

例如：

```text
回复率 = 回复数量 / 投递数量
```

应该由程序计算，而不是让 LLM “估算”。

---

## 3.4 Human-in-the-loop

关键内容默认采用：

```text
AI 生成
   ↓
用户查看
   ↓
用户修改 / 确认
   ↓
保存
```

尤其是：

- 简历内容
- 项目描述
- HR 开场白
- 投递记录

不默认自动替用户执行。

---

# 4. MVP 功能范围

MVP 重点不是功能多，而是跑通**最核心的求职闭环**。

## 4.1 MVP 核心模块

| 模块 | MVP | 说明 |
|---|:---:|---|
| Career Assets | ✅ | 项目 + 技能 |
| JD Analysis | ✅ | 仅支持粘贴 JD 文本 |
| Resume Agent | ✅ | JD 定制简历 |
| Project Agent | ✅ | 项目润色 |
| HR Agent | ✅ | 开场白生成 |
| Resume Studio | ✅ | HTML / PDF 简历 |
| Application Log | ✅ | 极简投递记录 |
| Dashboard | ✅ | 基础投递统计 |

---

## 4.2 明确不做

### JD

```text
❌ 招聘网站 URL 自动解析
❌ 网页爬虫
❌ 招聘网站登录
```

**原因：**

URL 解析依赖爬虫，存在反爬、网页结构变化和维护成本。

MVP 只做：

> **粘贴 JD 文本**

---

### Application

```text
❌ 复杂 Kanban
❌ 拖拽状态流转
❌ 邮件自动同步
❌ 日历同步
❌ 自动提醒
❌ 自动投递
❌ 自动发送 HR 消息
```

MVP 只做：

> **极简表格记录**

---

### Career Assets

不建立复杂的人事档案系统，仅维护简历所需的轻量资产：

```text
Career Assets
├── Basic Info（含求职意向）
├── Projects
├── Skills
├── Education
├── Research / Campus（可选）
├── Honors（可选）
└── 自我评价（可选）
```

教育、科研、校园、荣誉等均使用轻量结构（详见 §6），不建立复杂数据模型。

---

# 5. 核心用户流程

## 5.1 主流程

```text
【资产准备阶段（一次投入，持续积累）】
1. Career Assets 盘点（结构化问卷 + AI 对话深挖）→ AI 辅助填写产出通用版表达
2. Project Agent 求职场景表达（简历版 Bullet / 面试版 / STAR 版，不依赖 JD）
        ↓
【求职定制阶段（每次投递）】
3. 粘贴 JD → JD Agent 分析
        ↓
4. JD Match 匹配决策（相关项目 / 技能命中 / 缺口）
        ↓
5. Resume Agent 定制整份简历（JD 驱动：选取 / 排序 / JD 化措辞）
        ↓
6. Reflection 验证（匹配度 + 编造检查）→ MD 预览 → 用户迭代调整
        ↓
7. Resume Studio 选模板 → 生成 HTML / PDF
        ↓
8. HR Agent 开场白
        ↓
9. Application Log 投递记录
```

## 5.2 关键设计点

```text
1. 两层表达：AI 辅助填写在盘点时产出通用版；Project Agent（专用 LLM + Prompts）产出求职场景表达；Resume Agent 做 JD 化定制
2. 素材先行：先盘点、再表达、后组装——Project Agent 前置且不依赖 JD（PRD §2.1 问题二的解法）
3. 匹配决策：JD Match 结果作为简历定制（选取 / 排序 / 措辞）的依据
4. 技能调整限定在简历展示层：资产库不被 JD 改写
5. Reflection 迭代环：匹配度验证 + 编造检查（程序校验 + LLM 自检），发现问题回到定制步骤调整，直到用户满意
6. 分阶段呈现：迭代阶段用 Markdown 版预览（内容优先），选定模板后用 HTML 版（视觉优先）
7. 多版本按需生成：简历版 Bullet 在资产准备阶段生成；面试版 / STAR 版按需触发
8. Prompt 统一管理：所有 Prompt 放 backend/prompts/，Jinja2 模板文件管理，不进代码
```

---

# 6. Career Assets 个人求职资产

## 6.1 定位

Career Assets 是整个系统的**核心数据基础**。

它不是传统意义上的完整个人简历，而是：

> **用户可以被 Agent 持续调用的求职资产库。**

核心内容：

```text
Career Assets
│
├── Basic Info（含求职意向）
├── Projects
├── Skills
├── Education
├── Research / Campus（可选）
├── Honors（可选）
└── 自我评价（可选）
```

---

# 6.2 Projects

项目是整个系统最重要的数据源。

### 项目字段

```text
项目名称
项目简介
项目背景
项目目标
项目时间
项目角色
技术栈
个人职责
核心工作
技术难点
解决方案
项目成果
GitHub / Demo
Evidence
```

---

## 6.3 Evidence

每个重要项目可以关联证据：

```text
Project
   │
   ├── Facts
   ├── Claims
   └── Evidence
```

例如：

```text
Review-Agent
│
├── 使用 LangGraph
├── 使用 RAG
├── 使用 FastAPI
│
└── Evidence
    ├── GitHub
    ├── 项目文档
    └── Demo
```

---

# 6.4 Skills

技能数据保持简单。

```text
技能名称
熟练程度
关联项目
```

例如：

```text
LangGraph
   └── Review-Agent

RAG
   └── Review-Agent

FastAPI
   └── Review-Agent
```

这样 JD Agent 可以直接进行：

```text
JD Requirement
       ↓
Skill Match
       +
Project Match
```

## 6.5 Basic Info 与求职意向

```text
基本信息（必填）：姓名、邮箱、电话、GitHub
基本信息（可选）：个人主页
求职意向：意向岗位、城市、到岗时间（立即到岗 / 一周内 / 两周内 / 一个月内 / 待定）
```

求职意向在定制简历与 HR 开场白时调用，并可参与 JD Match 提示（如城市不符）。

## 6.6 Education 教育背景

必填，支持多条（如本科 + 硕士）。每条结构：

```text
{学校, 专业, 阶段（本科 / 硕士 / 博士）, 时间}
```

可选补充：主修课程。

## 6.7 Research / Campus 科研与校园经历

均为可选。结构参考项目经历的精简版（名称、角色、时间、描述）。

## 6.8 Honors 荣誉证书

可选。证书 / 荣誉名称、时间。

## 6.9 自我评价

可选。个人自评文本，定制简历时可调用、可重写。

---

# 7. JD Analysis JD 分析

## 7.1 输入

MVP 只支持：

> **粘贴 JD 文本**

界面：

```text
┌─────────────────────────────────────┐
│ Paste Job Description               │
│                                     │
│ 请粘贴岗位描述……                    │
│                                     │
│                                     │
│                         [开始分析]  │
└─────────────────────────────────────┘
```

---

# 7.2 JD Agent

处理流程：

```text
JD
 ↓
岗位名称识别
 ↓
职责提取
 ↓
技能要求提取
 ↓
经验要求提取
 ↓
学历要求提取
 ↓
加分项提取
 ↓
关键词提取
 ↓
岗位画像
```

---

# 7.3 JD Analysis 输出

例如：

```text
岗位：AI 应用工程师

核心技能
★★★★★ Python
★★★★★ RAG
★★★★★ Agent
★★★★☆ LangGraph
★★★★☆ FastAPI

加分项
★★★ Docker
★★★ PostgreSQL
★★ Redis

岗位职责
1. Agent 应用开发
2. RAG 系统开发
3. API 服务开发
```

---

# 7.4 JD Match

JD 与 Career Assets 进行匹配。

```text
总体匹配度：87%

强匹配
✓ Python
✓ RAG
✓ LangGraph
✓ FastAPI

部分匹配
△ Docker

缺失
✗ Redis
```

---

# 7.5 Gap Analysis

输出：

```text
你的优势
1. 有完整 Agent 项目
2. 有 RAG 实践
3. 有 FastAPI 开发经验

你的不足
1. 缺少 Redis 实践
2. 缺少生产级部署案例
```

---

# 8. Resume Agent 简历 Agent

## 8.1 核心目标

根据：

```text
JD
+
Career Assets
+
Evidence
```

生成：

> **Targeted Resume / 岗位定制简历**

---

# 8.2 工作流程

```text
JD
 ↓
JD Analysis
 ↓
Career Assets Retrieval
 ↓
Project / Skill Matching
 ↓
Evidence Validation
 ↓
Content Generation
 ↓
Resume Version
```

---

# 8.3 简历版本

一个用户可以拥有多个岗位版本：

```text
Master Resume
│
├── AI 应用工程师
├── Agent 工程师
├── 后端开发
└── 算法工程师
```

每次重大修改生成新的：

```text
Resume Version
```

---

# 8.4 简历优化

支持：

### 内容重写

```text
原始经历
   ↓
专业表达
```

### JD 定制

```text
JD
 ↓
相关项目优先
 ↓
相关技能突出
 ↓
不相关内容弱化
```

### Bullet 优化

例如：

> 做了一个 RAG 项目。

优化为：

> 基于 LangGraph 构建 RAG Agent Workflow，完成知识库检索、重排与生成流程的模块化编排。

---

# 8.5 简历安全边界

禁止：

```text
❌ 编造项目
❌ 编造工作经历
❌ 编造技术栈
❌ 编造数字
❌ 编造项目成果
```

允许：

```text
✓ 改写
✓ 重组
✓ 提炼
✓ 调整顺序
✓ 突出关键词
✓ 根据 JD 调整表达
```

---

# 9. Project Agent 项目 Agent

## 9.1 核心目标

将：

> “我做过什么”

转换成：

> “为什么做、怎么做、解决什么问题、产生什么结果”。

定位：前置素材层——不依赖 JD，在资产准备阶段生成求职场景表达；针对具体 JD 的措辞调整由 Resume Agent 完成。

---

# 9.2 输入

用户提供：

```text
项目名称
项目背景
项目目标
个人工作
技术栈
技术难点
解决方案
项目结果
```

---

# 9.3 Agent 工作流

```text
原始项目
   ↓
项目理解
   ↓
技术亮点提取
   ↓
个人贡献提取
   ↓
技术难点提取
   ↓
成果提取
   ↓
多场景表达
```

---

# 9.4 输出

### 简历版

生成 1～3 条高质量 Bullet。

### 面试版

```text
项目背景
我的职责
技术架构
核心难点
解决方案
最终效果
```

### STAR 版

```text
Situation
Task
Action
Result
```

---

# 10. HR Agent 沟通 Agent

## 10.1 功能

根据：

```text
JD
+
Career Assets
+
目标岗位
```

生成求职开场白。

---

# 10.2 场景

MVP 支持：

```text
Boss直聘
微信
邮件
LinkedIn
```

---

# 10.3 输出模式

```text
简短版
标准版
技术版
```

核心结构：

```text
我是谁
+
我有什么相关经历
+
为什么匹配这个岗位
+
希望进一步沟通
```

避免高度模板化的：

> “尊敬的 HR 您好，我非常荣幸……”

---

# 11. Resume Studio 简历工作台

## 11.1 核心目标

实现：

> **内容与视觉模板分离。**

架构：

```text
Resume JSON
     ↓
Template Engine
     ↓
HTML
     ↓
CSS
     ↓
Browser Preview
```

---

# 11.2 模板

MVP 提供 3 个基础模板：

```text
Template 01 — Classic
Template 02 — Modern
Template 03 — Minimal
```

---

# 11.3 编辑界面

采用左右布局：

```text
┌──────────────────┬────────────────────┐
│ Resume Content   │ Preview            │
│                  │                    │
│ Basic Info       │       Resume       │
│ Experience       │                    │
│ Projects         │                    │
│ Skills           │                    │
│                  │                    │
│ [AI 优化]        │                    │
└──────────────────┴────────────────────┘
```

---

# 11.4 输出

MVP：

```text
HTML
PDF
```

未来：

```text
DOCX
LaTeX
```

## 11.5 简历内容结构

简历由 8 个内容段组成：

```text
1. 基本信息（姓名 / 邮箱 / 电话 / GitHub 必填；个人主页可选）
2. 教育背景（必填，可多条）
3. 科研经历（可选）
4. 校园经历（可选）
5. 项目经历（必填，来自 Projects 资产）
6. 荣誉证书（可选）
7. 专业技能（必填，来自 Skills 资产）
8. 自我评价（可选）
```

可选模块为空时，模板自动隐藏该段落。

---

# 12. Application Log 投递记录

## 12.1 产品定位

不做复杂求职 CRM。

只提供：

> **轻量级投递记录。**

---

# 12.2 数据字段

```text
公司
岗位
状态
投递时间
使用的简历版本
备注
```

---

# 12.3 状态

```text
待投递
已投递
已回复
面试
Offer
拒绝
无回复
```

---

# 12.4 UI

MVP 使用极简表格：

| 公司 | 岗位 | 状态 | 投递时间 | 简历 | 备注 |
|---|---|---|---|---|---|
| XXX | AI 应用工程师 | 已回复 | 09-01 | AI v3 | 等一面 |
| XXX | Agent 工程师 | 已投递 | 09-02 | Agent v2 | — |
| XXX | 后端开发 | Offer | 09-03 | Backend v1 | — |

---

## 12.5 为什么保留 Resume Version

Application 中保留：

```text
resume_version_id
```

这样未来可以分析：

```text
Resume V1
投递 40
回复 12

Resume V2
投递 30
回复 15
```

进一步分析：

> 哪个简历版本实际投递效果更好？

这为后续 Resume A/B Testing 留下数据基础。

## 12.6 Interview QA 面试问题记录

记录面试问题与回答，按公司分类，为后续面试复盘与 Interview Agent 提供数据基础。

```text
公司
岗位
面试时间
问题
我的回答
复盘备注
```

- 按公司分组展示
- 公司可关联投递记录（自动带出岗位）
- MVP 为极简 CRUD

---

# 13. Agent 架构

MVP 不采用一个“万能 Agent”。

推荐：

```text
                     ┌──────────────────┐
                     │ Supervisor Agent │
                     └────────┬─────────┘
                              │
             ┌────────────────┼────────────────┐
             ↓                ↓                ↓
        ┌─────────┐      ┌──────────┐     ┌────────────┐
        │ JD Agent│      │Resume Agent│    │Project Agent│
        └────┬────┘      └─────┬────┘     └──────┬─────┘
             │                 │                  │
             ↓                 ↓                  ↓
          JD分析            简历定制            项目润色
                              │
                    ┌─────────┴─────────┐
                    ↓                   ↓
               ┌─────────┐       ┌────────────┐
               │HR Agent │       │Future Agent│
               └─────────┘       └────────────┘
                    ↓
                 开场白
```

---

# 13.1 Supervisor Agent

负责：

```text
理解用户意图
任务路由
调用 Agent
管理 Workflow
```

---

# 13.2 JD Agent

负责：

```text
JD解析
岗位画像
关键词提取
技能要求
项目要求
JD Match
Gap Analysis
```

---

# 13.3 Resume Agent

负责：

```text
简历生成
简历修改
JD定制
关键词优化
内容重组
```

---

# 13.4 Project Agent

负责：

```text
项目理解
项目润色
技术亮点提取
STAR
简历 Bullet
面试项目介绍
```

---

# 13.5 HR Agent

负责：

```text
开场白
求职邮件
沟通文案
Follow-up
```

---

# 14. 数据模型

MVP 数据模型保持精简。

```text
┌─────────────┐
│    User     │
└──────┬──────┘
       │
       ├──────────────┐
       ↓              ↓
┌─────────────┐  ┌─────────────┐
│  Projects   │  │   Skills    │
└──────┬──────┘  └──────┬──────┘
       │                 │
       └────────┬────────┘
                ↓
        ┌───────────────┐
        │      JD       │
        └───────┬───────┘
                ↓
        ┌───────────────┐
        │  JD Analysis  │
        └───────┬───────┘
                ↓
        ┌───────────────┐
        │ Resume Version│
        └───────┬───────┘
                │
        ┌───────┴────────┐
        ↓                ↓
┌───────────────┐  ┌──────────────┐
│ Resume Studio │  │ Application  │
└───────────────┘  └──────────────┘
```

---

## 14.1 核心实体

```text
User

BasicInfo

Project
Skill
Evidence

JobDescription
JDAnalysis

Resume
ResumeVersion

Application

AgentRun
```

---

# 15. 前端页面

MVP 页面控制在较小范围。

```text
/
├── Dashboard
│
├── Career Assets
│   ├── Basic Info
│   ├── Projects
│   └── Skills
│
├── JD Analysis
│   ├── JD Input
│   └── Match Result
│
├── Resume Studio
│   ├── Resume List
│   ├── Resume Editor
│   └── HTML Preview
│
├── Project Copilot
│
├── HR Assistant
│
└── Applications
```

---

# 15.1 Dashboard

首页展示：

```text
┌─────────────────────────────────────────┐
│            AI Job Copilot               │
├────────┬────────┬────────┬──────────────┤
│ 投递   │ 回复   │ 面试   │ Offer        │
│  86    │  31    │  12    │  3           │
├────────┴────────┴────────┴──────────────┤
│                                         │
│ 最近投递                                │
│                                         │
│ XXX   AI应用工程师   已回复             │
│ XXX   Agent工程师    已投递             │
│ XXX   后端开发       Offer              │
└─────────────────────────────────────────┘
```

---

# 16. MVP 验收标准

第一版完成后，用户应该能够完整完成：

```text
✓ 创建 Basic Info

✓ 添加项目

✓ 添加技能

✓ 粘贴 JD

✓ AI 分析 JD

✓ 查看 JD 与个人资产匹配结果

✓ 查看 Gap Analysis

✓ AI 生成定制简历

✓ AI 修改项目经历

✓ 生成项目 Bullet

✓ 生成 STAR 描述

✓ 选择简历模板

✓ 实时预览 HTML 简历

✓ 导出 PDF

✓ 生成 HR 开场白

✓ 创建投递记录

✓ 修改投递状态

✓ 查看投递数量

✓ 查看回复数量

✓ 查看面试数量

✓ 查看 Offer 数量
```

最重要的验收标准：

> **用户能够在资产盘点（AI 辅助填写 + 项目表达）之后，从一个 JD 出发，在系统内完成“分析 → 匹配 → 定制简历 → Reflection 验证 → HTML/PDF → HR 开场白 → 投递记录”的完整流程。**

---

# 17. V2 / V3 规划

## V2

在 MVP 稳定后增加：

```text
Interview Agent
Offer Management
Career Analytics
Resume A/B Testing
更完善的 Evidence System
```

---

## V3

进一步增加：

```text
JD URL 自动解析
GitHub 自动读取
项目代码分析
邮件同步
日历同步
面试语音模拟
AI Mock Interview
智能 Follow-up
求职策略 Agent
```

---

# 18. 项目最终定位

## 18.1 一句话定位

> **AI Job Copilot 是一个面向 AI / 互联网求职者的 AI 简历与求职辅助平台，以个人项目与技能资产为基础，通过 JD 分析、岗位匹配、简历定制、项目润色和求职沟通生成，帮助用户快速针对不同岗位制作高匹配度的求职材料，并记录实际投递结果。**

---

## 18.2 核心产品闭环

```text
               Career Assets 盘点
            （AI 辅助填写 → 通用版）
                     │
                     ↓
               Project Agent
              求职场景表达
                     │
                     ↓
                    JD
                     │
                     ↓
                JD Analysis
                     │
                     ↓
               Project / Skill
                  Matching
                     │
                     ↓
                Resume Agent
              JD 化定制整份简历
                     │
                     ↓
              Reflection 验证
                     │
                     ↓
                Resume Studio
                     │
                     ↓
                 HTML / PDF
                     │
                     ↓
                  HR Agent
                     │
                     ↓
                  开场白
                     │
                     ↓
              Application Log
                     │
                     ↓
                 投递结果
```

---

## 18.3 产品核心竞争力

### ① Career Assets

不是每次重新告诉 AI 自己做过什么，而是建立持续积累的：

> **个人求职资产库**

### ② Evidence-based Resume

简历内容尽可能基于：

> **事实 + 证据**

避免 AI 幻觉式包装。

### ③ JD-aware Resume

不是生成一份“看起来不错”的简历，而是：

> **针对具体岗位生成更匹配的简历。**

### ④ Project-first

以：

> **项目经历 + 技能栈**

作为 AI 求职资产的核心。

### ⑤ Application Feedback

记录实际投递结果，为未来：

> **数据驱动的求职策略优化**

提供基础。

---

# 19. MVP 开发主线

第一阶段严格围绕这一条主线：

```text
┌─────────────────────────────────────────────┐
│                                             │
│     Career Assets 盘点（AI 辅助填写）        │
│               ↓                             │
│     Project Agent 求职场景表达               │
│               ↓                             │
│              JD                             │
│               ↓                             │
│           JD Agent                          │
│               ↓                             │
│           岗位匹配                           │
│               ↓                             │
│         Resume Agent                        │
│               ↓                             │
│        JD 化定制整份简历                     │
│               ↓                             │
│         Reflection 验证                     │
│               ↓                             │
│         Resume Studio                       │
│               ↓                             │
│           HTML / PDF                        │
│               ↓                             │
│           HR Agent                          │
│               ↓                             │
│          Application Log                    │
│                                             │
└─────────────────────────────────────────────┘
```

> **第一阶段目标不是做一个“大而全”的求职平台，而是把这条链路做到完整、稳定、有 Agent 特征。**

---

# 20. 产品设计结论

最终 MVP 可以概括为：

| 层级 | 核心能力 |
|---|---|
| **数据层** | Projects + Skills + Evidence |
| **理解层** | JD Agent |
| **生成层** | Resume Agent + Project Agent + HR Agent |
| **展示层** | Resume Studio / HTML / PDF |
| **记录层** | Application Log |
| **入口层** | Dashboard |
| **Agent编排** | Supervisor + Specialized Agents |

因此，项目的核心并不是：

> **“帮用户写一份简历。”**

而是：

> **“让 AI 理解用户有什么，再理解岗位需要什么，然后基于真实经历生成针对性的求职材料，并记录实际结果。”**

最终形成：

```text
Know Me
   ↓
Understand the Job
   ↓
Match
   ↓
Tailor My Resume
   ↓
Polish My Projects
   ↓
Help Me Communicate
   ↓
Track Application
   ↓
Learn From Results
```

这就是 **AI Job Copilot** 的产品闭环。
