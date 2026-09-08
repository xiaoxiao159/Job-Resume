# 04 API 设计（API Design）

> 项目：AI Job Copilot
> 依据：01-feature-design.md v0.4 · 02-data-model.md v0.4 · 03-ui-ux-design.md v0.2
> 版本：v0.3
> 状态：已确认
> 更新：2026-09-07
> 技术前提：FastAPI + SQLAlchemy 2.0 + PostgreSQL；单用户模式（无鉴权）；前端 React SPA；LLM 流式输出 SSE

## 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-09-04 | 初稿：全局约定、异步任务统一模式、10 组资源端点、错误码、待确认决策 |
| v0.2 | 2026-09-04 | 确认：§9 五项决策全部采纳转确认记录；决策 #1 已在 02 v0.3 落实（resume_versions 定稿模型） |
| v0.3 | 2026-09-07 | 后端实现落地修订：新增 `POST /agent-runs/{id}/feedback`（👍/👎，03 §4.1 前端已实现，05 待确认 #4 采纳，02 v0.4 补列）；错误码表新增 `analysis_not_ready`（409，匹配前置校验）与 `pdf_not_available`（501，未装 playwright）；§5.4 PDF 导出模板未选时回退 classic（前端 mock 契约，07 §1） |

---

## 1. 设计原则

| 原则 | API 落实 |
|---|---|
| 程序负责确定性（PRD §3.3） | 统计（dashboard）、MD/HTML 渲染、回填应用（apply）等确定性逻辑全部后端执行，不交 LLM |
| Human-in-the-loop | Agent 生成一律「触发 → 流式 → 待确认」，API 不提供"生成并直接生效"的组合端点 |
| 快照优先（02 决策 #1） | 简历版本内容落库后不再关联资产表；编辑权限受定稿状态约束（§6.4） |
| 可观测性 | 所有 LLM 调用走 agent_runs 统一任务模式，输入/输出引用、耗时、token 全留痕 |
| 单用户预留 | 资源路径不嵌套 user_id；固定默认用户从上下文注入，将来多用户时加 `/users/:id` 前缀或鉴权中间件即可 |

## 2. 全局约定

### 2.1 基础

- 前缀：`/api/v1`；资源复数、kebab-case；JSON 字段 **snake_case**（与 DB 列名一致，零映射成本）
- 时间：ISO 8601 UTC（`2026-09-04T08:30:00Z`）；日期：`YYYY-MM-DD`
- ID：UUID 字符串
- 文档：FastAPI 自动 OpenAPI（/docs）

### 2.2 响应封装

成功：

```json
// 单资源
{ "data": { "id": "…", "name": "Review-Agent", "created_at": "…" } }

// 列表
{
  "data": [ … ],
  "meta": { "total": 42, "page": 1, "per_page": 20, "total_pages": 3 },
  "links": { "self": "/api/v1/projects?page=1", "next": "/api/v1/projects?page=2" }
}
```

错误（统一）：

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [ { "field": "name", "message": "Field required", "code": "missing" } ]
  }
}
```

### 2.3 分页 / 排序 / 筛选

- 所有列表端点：offset 分页 `?page=1&per_page=20`（默认 20，max 100；单用户数据集小，MVP 不引 cursor）
- 排序：`?sort=-created_at`（`-` 前缀降序，逗号分隔多字段）
- 筛选：等值 `?status=applied,replied`（逗号多值）；搜索 `?q=`（名称/标题 ILIKE）

### 2.4 状态码

| 码 | 用途 |
|---|---|
| 200 | GET / PUT / PATCH / 确认类动作（带响应体） |
| 201 | POST 创建（Location 头） |
| 202 | **Agent 任务已受理**（body 带 agent_run_id，见 §3） |
| 204 | DELETE |
| 400 | JSON 解析失败 / 参数格式错 |
| 404 | 资源不存在 |
| 409 | 冲突（唯一约束、状态机禁止的转换、已定稿版本不可编辑） |
| 422 | 校验失败（Pydantic，带字段级 details） |
| 500 | 服务端异常（不暴露内部细节） |

---

## 3. 异步任务统一模式（Agent 调用核心设计）

所有 LLM 调用（JD 分析、匹配、表达生成、简历生成、Reflection、HR 文案、AI 辅助填写）走同一协议：

```text
① 触发        ② 订阅                     ③ 取结果
POST …/analyze   GET /agent-runs/{id}/events   GET 结果实体（按 done 事件 refs）
   ↓                    ↓
202 + agent_run_id  SSE: status → chunk* → done/error
```

### 3.1 触发

```http
POST /api/v1/job-descriptions/{jd_id}/analyze
→ 202 Accepted
```

```json
{ "data": { "agent_run_id": "uuid…", "status": "running" } }
```

请求参数一律 JSON body（含 LLM 所需的业务引用，如 `{"jd_id": "…", "messages": […]}`）。

### 3.2 SSE 订阅（GET /agent-runs/{id}/events）

```text
event: status   data: {"status": "running"}
event: chunk    data: {"text": "岗位名称：AI 应用工程师\n核心技能：\n"}   ← 流式文本
event: chunk    data: {"text": "★★★★★ Python\n"}
event: done     data: {"status": "completed", "refs": {"jd_analysis_id": "…"}, "result": {…}}
event: error    data: {"status": "failed", "error": {"code": "llm_error", "message": "…"}}
```

- `chunk` 为展示用流式文本；**最终产物以 done 为准**：结构化结果放 `result`（如回填建议 fields），有实体落库的放 `refs`，前端再 GET 实体
- 断线重连：EventSource 自动重连后，前端先 GET `/agent-runs/{id}` 查状态——已完成则跳过订阅直接取结果；`events` 端点对已完成任务**一次性重放**全部事件（幂等回放，服务端保留事件缓冲至任务完成 + 24h）
- 取消：`POST /api/v1/agent-runs/{id}/cancel`（尽力而为，LLM 调用中断）
- 超时：任务 120s 无进展判 failed（agent_runs.error 记录）

### 3.3 通用查询

- `GET /api/v1/agent-runs` — 日志列表（?agent_type=&status=，分页）
- `GET /api/v1/agent-runs/{id}` — 详情（input_refs / output_refs / tokens / latency / error）

> 前端封装为一个 `useAgentTask()` hook：触发 → 订阅 → 流式状态 → done 后取实体。所有 AI 交互共用。

---

## 4. 端点总览

| 模块 | 端点 | 方法 | 说明 |
|---|---|---|---|
| **Dashboard** | `/dashboard` | GET | 统计 + 盘点进度 + 最近投递 |
| **Career Assets** | `/basic-info` | GET/PUT | 单例资源 |
| | `/educations` `/experiences` `/honors` | GET/POST | |
| | `/educations/{id}` 等 | GET/PATCH/DELETE | |
| | `/educations/reorder` 等 | PUT | 批量排序 `{ids: []}` |
| | `/projects` | GET/POST | ?q= 搜索 |
| | `/projects/{id}` | GET/PATCH/DELETE | |
| | `/projects/{id}/evidence` | GET/POST | |
| | `/evidence/{id}` | PATCH/DELETE | |
| | `/projects/{id}/skills` | GET/PUT | PUT 批量设置关联 `{skill_ids: []}` |
| | `/skills` | GET/POST | |
| | `/skills/{id}` | PATCH/DELETE | |
| | `/projects/{id}/expressions` | GET/POST | POST 生成（202）；?type= 过滤 |
| | `/project-expressions/{id}` | PATCH | 确认 / 编辑内容 |
| | `/projects/{id}/assist/questionnaire` | POST | AI 辅助填写 · 第一段问卷（202） |
| | `/projects/{id}/assist/messages` | POST | 第二段多轮对话（202，无状态） |
| | `/projects/{id}/assist/refill` | POST | 停止并回填建议（202） |
| **JD Analysis** | `/job-descriptions` | GET/POST | |
| | `/job-descriptions/{id}` | GET/PATCH/DELETE | |
| | `/job-descriptions/{id}/analyze` | POST | JD Agent（202） |
| | `/job-descriptions/{id}/analysis` | GET | 岗位画像（1:1） |
| | `/job-descriptions/{id}/matches` | GET/POST | POST 重新匹配（202）；列表最新在前 |
| **Project Copilot** | （同 `/projects/{id}/expressions`，前端复用 Project 表达端点） | | |
| **Resume Agent** | `/resumes` | GET/POST | ?target_role= 分组筛选 |
| | `/resumes/{id}` | GET/PATCH/DELETE | PATCH 改 template / title |
| | `/resumes/{id}/versions` | GET/POST | POST 生成定制简历（202） |
| | `/resume-versions/{id}` | GET | |
| | `/resume-versions/{id}` | PATCH | **仅 pending 状态**可编辑内容（§6.4） |
| | `/resume-versions/{id}/regenerate` | POST | 重生成新版本（202） |
| | `/resume-versions/{id}/reflect` | POST | Reflection 验证（202） |
| | `/resume-versions/{id}/confirm` | POST | 确认定稿（锁定，reflection 判定） |
| | `/resume-versions/{id}/preview` | GET | ?format=md\|html 后端渲染 |
| | `/resume-versions/{id}/export` | GET | ?format=html\|pdf 文件流 |
| **HR Agent** | `/hr-messages` | GET/POST | POST 生成（202） |
| | `/hr-messages/{id}` | GET/PATCH/DELETE | |
| **Applications** | `/applications` | GET/POST | ?status=&q=&sort= |
| | `/applications/{id}` | GET/PATCH/DELETE | 状态流转 = PATCH status |
| **Interview QA** | `/interview-qa` | GET/POST | ?company= 筛选；默认按公司+时间排序 |
| | `/interview-qa/{id}` | PATCH/DELETE | |
| **Agent 横切** | `/agent-runs` `/agent-runs/{id}` | GET | |
| | `/agent-runs/{id}/events` | GET | SSE（§3） |
| | `/agent-runs/{id}/cancel` | POST | |
| | `/agent-runs/{id}/feedback` | POST | `{feedback: "up"\|"down"}` 👍/👎（v0.3，可覆盖） |

---

## 5. 端点明细（关键示例）

### 5.1 Dashboard

```http
GET /api/v1/dashboard
```

```json
{
  "data": {
    "stats": { "applied": 86, "replied": 31, "interview": 12, "offer": 3, "reply_rate": 0.36 },
    "asset_progress": { "basic_info": true, "projects_count": 5, "skills_count": 12, "education_count": 1 },
    "recent_applications": [
      { "id": "…", "company": "字节跳动", "position": "AI 应用工程师",
        "status": "replied", "applied_at": "2026-09-01", "resume_version": { "id": "…", "resume_title": "AI 应用工程师", "version_number": 3 } }
    ]
  }
}
```

- 统计口径（02 §8）：`applied = status <> 'to_apply'`；`replied = status IN (replied, interview, offer)`；全部后端 SQL 计算

### 5.2 Career Assets

#### Basic Info（单例）

```http
PUT /api/v1/basic-info
```

```json
{
  "name": "张三", "email": "a@b.com", "phone": "138…", "github_url": "https://…",
  "homepage_url": null, "job_role": "AI 应用工程师", "city": "上海",
  "availability": "within_1_week", "self_evaluation": "…"
}
```

- GET 返回 200；不存在时 PUT 创建（单例 upsert 语义）；无 DELETE
- **AI 优化自我评价**：走 assist 模式（复用 `/assist/refill` 的子集或独立任务端点 `POST /api/v1/basic-info/polish-self-eval`（202），产物为回填建议）→ 用户确认后 PUT。基本信息其余字段不开放 AI 修改。

#### Projects

```http
GET /api/v1/projects?q=agent&sort=-created_at
POST /api/v1/projects
PATCH /api/v1/projects/{id}
```

- POST/PATCH body = projects 表字段（name / summary / background / goal / start_date / end_date / role / tech_stack[] / responsibilities / core_work / difficulties / solutions / results / github_url / demo_url / sort_order）
- DELETE 级联（evidence / project_expressions / project_skills），响应 204

#### Evidence / Skills 关联

```http
GET /api/v1/projects/{id}/evidence
POST /api/v1/projects/{id}/evidence
{ "type": "github", "title": "GitHub 仓库", "url": "https://…", "note": null }

GET /api/v1/projects/{id}/skills          → { "data": [ { "id": "…", "name": "LangGraph", "proficiency": "proficient" } ] }
PUT /api/v1/projects/{id}/skills
{ "skill_ids": ["uuid…", "uuid…"] }        → 批量替换关联（事务）
```

#### AI 辅助填写（两段式，无状态多轮）

```http
① 第一段：结构化问卷
POST /api/v1/projects/{id}/assist/questionnaire
{
  "answers": [
    { "question": "该项目的背景？要解决什么问题？", "answer": "…" },
    { "question": "你在其中担任什么角色、具体负责什么？", "answer": "…" }
  ]
}
→ 202 + agent_run_id；done.result = { "follow_up": "你提到性能是难点，具体是哪个环节慢？" }

② 第二段：多轮对话（前端持历史，每轮全量发送）
POST /api/v1/projects/{id}/assist/messages
{
  "messages": [
    { "role": "user", "content": "…" },
    { "role": "assistant", "content": "…" }
  ]
}
→ 202 + agent_run_id；chunk 流式回复

③ 停止并回填
POST /api/v1/projects/{id}/assist/refill
{ "messages": [ …完整对话历史… ] }
→ 202 + agent_run_id；done.result = {
    "fields": { "background": "…", "goal": "…", "responsibilities": "…", "difficulties": "…", "solutions": "…", "results": "…" }
  }

④ 用户确认回填 = 普通 PATCH
PATCH /api/v1/projects/{id}   ← 前端 diff 高亮后提交确认的字段
```

> 设计：**不建会话表**（02 数据模型未含），前端持有对话历史、每轮全量发送。刷新丢历史，MVP 可接受；如需持久化会话，V2 加 `assist_sessions` 表（待确认决策 #4）。

#### 项目表达（M3）

```http
POST /api/v1/projects/{id}/expressions
{ "type": "resume_bullet" }        // resume_bullet | interview | star
→ 202；done.refs = { "project_expression_id": "…" }（新版本号 = 该组合最大 + 1，status=draft）

GET /api/v1/projects/{id}/expressions?type=resume_bullet
→ 版本列表（version_number 倒序）

PATCH /api/v1/project-expressions/{id}
{ "status": "confirmed" }          // 确认
或 { "content": { "bullets": ["…"] } }  // 编辑后保存（同请求可带 status）
```

- 重新生成 = 再次 POST（后端自增版本号留档，02 决策 #5），**无覆盖语义**

### 5.3 JD Analysis

```http
POST /api/v1/job-descriptions
{ "title": "AI 应用工程师", "company": "字节跳动", "raw_text": "…JD 原文…" }

POST /api/v1/job-descriptions/{id}/analyze
→ 202；done.refs = { "jd_analysis_id": "…" }

GET /api/v1/job-descriptions/{id}/analysis
→ { "data": { "id": "…", "status": "completed", "title": "AI 应用工程师",
     "core_skills": [{"name": "Python", "stars": 5}], "plus_skills": […],
     "responsibilities": ["…"], "experience_requirement": "3-5 年",
     "education_requirement": "本科及以上", "keywords": ["Agent", "RAG"] } }

POST /api/v1/job-descriptions/{id}/matches    → 202；done.refs = { "jd_match_id": "…" }
GET /api/v1/job-descriptions/{id}/matches     → 留档列表（created_at 倒序）
```

- analyze / matches 可重复触发：analysis 1:1 覆盖更新；matches 1:N 每次留档（02 决策 #6）
- `analysis.status = processing` 期间 GET 返回 processing，前端显示骨架屏

### 5.4 Resumes / Resume Versions（含定制流程）

```http
POST /api/v1/resumes
{ "title": "AI 应用工程师", "target_role": "AI 应用工程师" }
→ 409 若 target_role 已存在（UNIQUE(user_id, target_role)）

POST /api/v1/resumes/{id}/versions
{ "jd_id": "uuid…", "instruction": "突出 Agent 项目" }   // jd_id 可空（Master 版）
→ 202；done.refs = { "resume_version_id": "…" }（新版本号 +1，content 为 8 段快照，reflection_status=pending）
```

#### 迭代与定稿（核心状态机）

```text
pending ──PATCH content（可编辑，Studio 编辑）──→ pending
pending ──reflect（202）──→ passed / issues（后端判定，reflection_result 落库）
pending | passed | issues ──confirm──→ 定稿：content 锁定
```

```http
PATCH /api/v1/resume-versions/{id}          // 仅 pending；定稿后 409
{ "content": { …8 段 JSON（02 §6.1）… } }

POST /api/v1/resume-versions/{id}/reflect   → 202；done.refs = {} （reflection_result 直接写该版本）
POST /api/v1/resume-versions/{id}/confirm
→ 200 { "data": { "reflection_status": "passed", "locked": true } }
   · issues 状态 confirm → 202 提示仍可定稿（前端二次确认）；定稿后 content PATCH → 409 locked_version

POST /api/v1/resume-versions/{id}/regenerate
{ "instruction": "去掉 Docker 相关表述" }    → 202；生成 v+1 新版本（当前版本不动）
```

> **与 02 数据模型的差异说明**：02 §4.15 定义版本"不可变、无 updated_at"。本设计将其细化为：**pending 状态可编辑（快照语义尚未生效），confirm 定稿后锁定不可变**（定稿版才被投递引用，快照语义的动机不破坏）。**已在 02 v0.3 落实**：resume_versions 增加 `updated_at`（仅 pending 期更新）+ `confirmed_at`（定稿锁定标记）。

#### Studio 渲染与导出（程序负责确定性）

```http
GET /api/v1/resume-versions/{id}/preview?format=md     → text/markdown
GET /api/v1/resume-versions/{id}/preview?format=html   → text/html（按 resumes.template 渲染）
GET /api/v1/resume-versions/{id}/export?format=html    → attachment 下载
GET /api/v1/resume-versions/{id}/export?format=pdf     → application/pdf
```

- 渲染由后端统一执行（Jinja2 模板引擎），MD / HTML 共用一套 8 段渲染逻辑，前端不重复实现；PDF 由 HTML 转换
- 模板切换：`PATCH /api/v1/resumes/{id} { "template": "modern" }`（template 为空时 preview/export html 返回 409 `template_not_selected`）
- **PDF 导出例外**（v0.3，前端 mock 契约，07 §1）：export pdf 在 template 为空时**不报 409，回退 classic 模板**导出——投递场景不应因未选模板被阻断；文件名 Content-Disposition 带 ASCII 回退 + `filename*` RFC 5987（支持中文简历标题）

### 5.5 HR Messages

```http
POST /api/v1/hr-messages
{ "jd_id": "…", "resume_version_id": "…", "scene": "boss_zhipin", "mode": "standard" }
→ 202；done.refs = { "hr_message_id": "…" }（content 为生成文案，状态即保存——生成后可 PATCH 编辑，无独立确认态）

GET /api/v1/hr-messages?jd_id=…     → 历史（created_at 倒序）
PATCH /api/v1/hr-messages/{id}      → 编辑文案 { "content": "…" }
```

> HR 文案与简历不同：轻量文案，生成即保存 + 可编辑（Human-in-the-loop 由"编辑/重新生成"承担，不做锁定状态机）。

### 5.6 Applications / Interview QA

```http
GET /api/v1/applications?status=interview,offer&q=字节&sort=-applied_at
POST /api/v1/applications
{ "company": "字节跳动", "position": "AI 应用工程师", "status": "to_apply",
  "applied_at": null, "resume_version_id": null, "note": null }
PATCH /api/v1/applications/{id}
{ "status": "interview" }            // 状态流转 = 普通 PATCH，后端校验状态机合法性

GET /api/v1/interview-qa?company=字节跳动
POST /api/v1/interview-qa
{ "application_id": null, "company": "字节跳动", "position": "AI 应用工程师",
  "interview_at": "2026-09-02", "question": "…", "answer": "…", "note": null }
```

- application_id 提供时，company/position 由后端从投递记录带出（忽略 body 中的冲突值或校验一致）
- 状态机校验：任意两态之间允许流转（PRD 未限定）；`applied_at` 为空且 status ≠ to_apply 时 422 提示补投递时间

---

## 6. 错误码表

| code | HTTP | 场景 |
|---|---|---|
| `validation_error` | 422 | Pydantic 校验失败（details 字段级） |
| `invalid_json` | 400 | 请求体非 JSON |
| `not_found` | 404 | 资源不存在 |
| `target_role_exists` | 409 | 简历目标岗位重复 |
| `skill_name_exists` | 409 | 技能重名（UNIQUE(user_id, name)） |
| `locked_version` | 409 | 定稿版本不可编辑 |
| `template_not_selected` | 409 | 未选模板请求 HTML 预览/导出（PDF 导出不触发，回退 classic，§5.6） |
| `task_running` | 409 | 同一资源已有进行中任务（如 JD 分析中重复触发） |
| `analysis_not_ready` | 409 | 匹配前置校验：JD 分析不存在或未完成（v0.3；早于任务协议失败，前端可引导先分析） |
| `task_timeout` | 500 | 任务超时（agent_runs.error 详情） |
| `llm_error` | 502 | LLM 上游失败（任务 error 事件） |
| `pdf_not_available` | 501 | 服务器未安装 playwright，PDF 导出不可用（v0.3） |
| `internal_error` | 500 | 未预期异常（不暴露内部细节） |

## 7. 与 02 数据模型映射

| 资源 | 表 |
|---|---|
| basic-info | basic_info（单例 upsert） |
| educations / experiences / honors | 同名表（reorder = 批量写 sort_order） |
| projects / skills / evidence | 同名表 + project_skills（PUT 批量替换） |
| project-expressions | project_expressions（POST 触发 = 插入新版本号；PATCH 确认/编辑） |
| assist/* | 无表：无状态 LLM 调用，仅 agent_runs 留痕（决策 #4） |
| job-descriptions / analysis / matches | job_descriptions + jd_analyses（覆盖）+ jd_matches（留档） |
| resumes / resume-versions | resumes + resume_versions（pending 可编辑，见决策 #1） |
| hr-messages | hr_messages（生成即保存） |
| applications / interview-qa | 同名表 |
| agent-runs | agent_runs（任务协议横切） |

## 8. 决定记录

| # | 决定 | 理由 |
|---|---|---|
| 1 | **Agent 任务统一协议**：触发 202 + agent_run_id → SSE 订阅 → done 取实体 | 所有 LLM 调用一种编程模型，前端一个 hook；agent_runs 天然留痕可观测（02 §4.19）；SSE 与 03 §9 决策 #3 一致 |
| 2 | SSE done 事件直接携带 `result`（结构化产物）与 `refs`（实体引用） | 回填建议等无实体表产物不落库也能取回；有实体的产物避免 SSE 塞大 JSON |
| 3 | 简历版本**pending 可编辑、confirm 定稿锁定**（需 02 升版配合，待确认 #1） | Studio 编辑需求（F5.2）与快照不可变（02 决策 #1）的折中：定稿版才被投递，快照动机不破坏 |
| 4 | AI 辅助填写**无会话表**，前端持历史全量发送 | 02 无会话表；MVP 对话为短生命周期工具；刷新丢历史可接受，V2 加 assist_sessions |
| 5 | MD/HTML 预览与导出**后端统一渲染**（Jinja2 模板引擎） | 程序负责确定性（PRD §3.3）；渲染逻辑单一来源，前端零重复实现 |
| 6 | HR 文案**生成即保存 + 可编辑**，不做锁定状态机 | 轻量文案与简历不同权；Human-in-the-loop 由编辑/重新生成承担 |
| 7 | reorder 用 PUT 批量端点（body 传 ids 数组） | 排序是集合操作，逐条 PATCH 会产生中间态与多次请求 |

## 9. 确认记录（v0.2，2026-09-04，用户确认）

| # | 问题 | 确认结果 | 落点 |
|---|---|---|---|
| 1 | resume_versions 可编辑性：02 定义"不可变"与本设计的"pending 可编辑、confirm 锁定" | **采用本设计** | 02 v0.3 已落实：resume_versions 增加 `updated_at` + `confirmed_at`（§4.15、决策 #15） |
| 2 | AI 优化自我评价端点：并入 assist 复用 vs 独立端点 | **独立端点** `POST /basic-info/polish-self-eval`（202） | 实现阶段（§5.2 已含端点描述） |
| 3 | SSE 事件缓冲保留时长（断线重连回放） | 任务完成 + 24h，MVP 内存队列 | 实现阶段 |
| 4 | 对话历史不持久化（无状态多轮） | **MVP 接受**；刷新丢历史，V2 加 assist_sessions 表 | 实现阶段 |
| 5 | PDF 生成方式 | 后端 HTML → PDF（weasyprint / playwright），预览与导出同源 | 依赖选型放实现阶段 |

## 10. 检查清单（对照 skill 规范）

- [x] URL 复数 / kebab-case / 无动词（动作类 POST：analyze / reflect / confirm / regenerate / reorder / export / preview 均为无法映射 CRUD 的动作，按规范允许）
- [x] 状态码语义（202 任务 / 201 Location / 409 冲突 / 422 字段级校验）
- [x] 统一 envelope + 错误格式（code / message / details）
- [x] 分页（offset，meta.total）+ 筛选（status 多值）+ 排序（-prefix）
- [x] 单用户模式显式说明（§1），多用户演进路径预留
- [x] 不泄漏内部细节（500 统一 internal_error；LLM 失败 502 llm_error）
- [x] 命名一致（snake_case 与 DB 同源）
- [x] OpenAPI 自动文档（FastAPI）
- [ ] 鉴权/限流：单用户本地应用，MVP 不配置（V2 多用户时引入）
