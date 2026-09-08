# 07 后端设计（Backend Design）

> 项目：AI Job Copilot
> 依据：04-api-design.md v0.3 · 05-agent-design.md v0.1 · 02-data-model.md v0.4 · 06-frontend-design.md v0.1（前端 API 契约已落地，是后端的验收标准）
> 版本：v0.4
> 状态：M1–M5 完成 + M6 页面级联调通过（16 页零错误）；PDF 导出已启用（playwright + chromium）
> 更新：2026-09-08
> 技术前提：FastAPI + asyncio 事件循环 + SQLAlchemy 2.0 同步 Session（DB 阶段经 asyncio.to_thread 隔离）+ PostgreSQL 13（Docker）；conda 环境 ai-job-copilot；单用户无鉴权
> 现状：后端全部完成——50 端点 / 10 Agent 任务（10 prompts）/ 15 repos / 8 路由模块 / rendering（MD+3 模板 HTML+PDF）+ reflection_checks + resume_assembler（Master 版 skip_llm 纯程序装配）；agent_runs.feedback 列已落库（02 v0.4）。冒烟：`scripts/smoke_m1.py`（M1 回归）+ `scripts/smoke_full.py`（全量验收，幂等可重跑）。余 M6 前端联调（VITE_USE_MOCK=false）

## 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-09-05 | 初稿：后端总体架构、Agent 任务框架（04 §3 + 05 §2 的落地方案）、10 任务实现矩阵、确定性服务、渲染服务、配置扩展、实施顺序、待确认问题 |
| v0.2 | 2026-09-05 | 用户反馈：**Agent 框架异步化**（asyncio 任务协程 + 并发信号量 ≥3，决定性 #1/#2/#6 重写）；架构按规范形式落地（横切关注点 §12.5）；§13 待确认按用户指示定稿 |
| v0.3 | 2026-09-05 | M1 实施完成：新增 §15 契约差异记录（5 处，前端契约为准）；LLM SDK 依赖修正 httpx→httpx2（openai 3.x 官方依赖为 httpx2）；现状行更新 |
| v0.4 | 2026-09-07 | M2–M5 全部实施完成：10 任务 + prompts、15 repos、8 路由（50 端点）、rendering/reflection_checks/resume_assembler、feedback 列落库；manager 增 skip_llm 谓词（Master 版纯程序装配）；全量冒烟 86/86 通过（含 M1 回归 37/37）。修复两处实现 bug：list_jds `dict(db.execute())`（Result 带 .keys() 被 dict 当 mapping）、resume_generate JD 版 Decimal 不可序列化 |

---

## 1. 设计原则（分层代码化）

| 原则 | 代码层落实 |
|---|---|
| HTTP 认知唯一入口在路由层 | repository 返回 None / 抛 ValueError，**不产生 HTTP**；路由把「取不到/冲突」翻成 AppError（04 §6 码表） |
| LLM 调用唯一接触面 | 所有 LLM 调用走 `services/agent_tasks/`（05 §2.1 统一管线），其余层不 import LLM 客户端 |
| 程序负责确定性 | 计分（jd_match/reflection match_score）、事实段组装（简历 8 段快照）、状态判定（reflection_status）、统计（dashboard）全部纯函数/服务层，**不经过 LLM** |
| 任务统一协议 | 全部 10 个任务：POST 触发 202 → SSE（status/chunk*/done/error）→ done.refs 取实体（04 §3） |
| 前端契约零映射 | 后端 response_model 逐字段复刻 frontend/src/api/* 的 snake_case 契约；变更契约必须前后端同步改 |

## 2. 现状盘点与分工

| 已实现 | 待实现 |
|---|---|
| database/models.py（19 表 + 14 CHECK）、session.py（sync engine + get_db）、init_db（lifespan 幂等） | **Agent 任务框架**（本设计核心：registry/事件缓冲/SSE/超时/取消/兜底） |
| infrastructure/config.py（LLM 三行 + PG 五行） | **10 个任务实现**（装配 + Prompt + 落库） |
| schemas/common.py（envelope 全套）、schemas/career_assets.py（23 DTO） | 各资源 schemas（projects/jd/resumes/…） |
| api/errors.py（AppError）、main.py（两个异常处理器 + lifespan） | 各资源路由 |
| repositories/users.py、basic_info.py；api/career_assets.py 的 basic-info 三件套 | 其余 repositories |
| | 渲染服务（preview/export）、dashboard 服务、config 扩展、prompts/ 模板 |

**分工约定（沿既有教学方式）**：CRUD 资源路由+repo 由**用户主写、我 review**（educations/experiences/honors 已在路上）；**Agent 任务框架、渲染服务、确定性服务、config 扩展由我实现**（复杂度高、跨层牵动大），每个里程碑交付后带用户验收。待确认 #7。

## 3. 目标目录结构

```text
backend/
├── api/                          # 路由层（唯一 HTTP 认知）
│   ├── errors.py                 # ✔ AppError（已有）
│   ├── career_assets.py          # basic_info ✔ + educations/experiences/honors
│   ├── projects.py               # projects/evidence/skills/expressions/assist
│   ├── jd_analysis.py            # job-descriptions/analyze/analysis/matches
│   ├── resumes.py                # resumes/resume-versions（状态机/preview/export）
│   ├── hr_messages.py
│   ├── applications.py           # applications + interview-qa
│   ├── agent_runs.py             # 任务横切：list/get/events(SSE)/cancel/(feedback 待 02 升版)
│   └── dashboard.py
├── schemas/                      # Pydantic DTO（出参 = 前端契约 + 04 envelope）
│   ├── common.py · career_assets.py        # ✔（已有）
│   ├── projects.py · jd_analysis.py · resumes.py · applications.py · agent_runs.py
├── repositories/                 # 数据访问（零 HTTP 零业务）；一律以 db: Session 首参
│   ├── users.py · basic_info.py            # ✔（已有）
│   ├── educations/experiences/honors/projects/skills/evidence/project_expressions
│   ├── job_descriptions/jd_analyses/jd_matches
│   ├── resumes/resume_versions/hr_messages/applications/interview_qa
│   └── agent_runs.py
├── services/                     # 业务逻辑/编排（本设计新增，重点）
│   ├── agent_tasks/              # ⑤ Agent 任务框架
│   │   ├── manager.py            #   单例：registry + 运行集 + 事件缓冲 + 线程调度
│   │   ├── registry.py           #   prompt_name → TaskDef（模型档/流式/装配/落库）
│   │   ├── events.py             #   事件缓冲（复连回放 24h，04 §3.2）+ 订阅队列
│   │   ├── llm_client.py         #   OpenAI 兼容封装（流式/reasoning/usage/兜底降级）
│   │   └── tasks/                #   10 个任务文件（每任务：装配→Prompt→解析→落库→done）
│   ├── resume_assembler.py       # 简历 8 段快照组装（05 §4.4 程序侧 + LLM 产物拼接，纯函数）
│   ├── scoring.py                # 匹配度公式 + reflection match_score（纯函数，05 决定 #8）
│   ├── reflection_checks.py      # Reflection 程序校验三项（05 §4.5 ①，纯函数）
│   └── rendering.py              # MD/HTML 渲染 + PDF 导出（04 决定 #5）
├── prompts/                      # ⑤ §3.1 目录（_partials + 10 个 .md.j2，随实现逐步落）
├── templates/                    # 简历渲染 HTML 模板（classic/modern/minimal + _partials 8 段）
├── infrastructure/config.py      # ✔ 扩展 LLM 分档配置（§8）
├── database/                     # ✔ models.py / session.py
└── main.py                       # ✔ 挂新路由即可
```

---

## 4. 分层约定（固化，照 basic_info 样板执行）

1. **路由三件套**：DTO 校验 → repository 调用（None/ValueError → AppError）→ `{"data": …}` + `response_model=Data[XxxRead]` 强校验出参。
2. **repository 分工**：查询返回 None（找不到）+ 冲突 raise ValueError（如 UNIQUE 撞车）；**不 catch 不吞**。
3. **跨表事务**：进 services 层（如 projects PUT skills 批量替换、DELETE 级联、reorder 批量写），repo 只管单表。
4. **时间**：ISO 8601（04 §2.1）；PG 容器 TZ=Asia/Shanghai 导致 +08:00——见待确认 #1。
5. **枚举**：值名即落库值，中文展示前端映射（已锁定）。
6. **错误码**：04 §6 码表 + 本设计新增一个 `input_too_large`（422，资产集超上下文预算，05 §5.2 显式报错），见待确认 #6。

---

## 5. Agent 任务框架（核心设计）

### 5.1 总体拓扑与异步模型（v0.2 重写，用户确认）

任务执行是 **asyncio 协程**，天然支持多任务并发；DB 保持同步栈（不动现有 repo/路由），在任务协程内以 `asyncio.to_thread` 承载阻塞访问。**并发上限 = 信号量 AGENT_MAX_CONCURRENCY（默认 3，env 可调），保证至少三个任务同时推进**：

```text
路由 POST（def，同步，用户既有三件套写法不变）
  → 冲突检查（§5.6）→ 用路由自身的 db 建 agent_runs 行（status=running）→ commit
  → manager.submit()：asyncio.run_coroutine_threadsafe(manager._run(run_id), loop)
  → 202 {data: {agent_run_id, status: "running"}}

任务协程（事件循环内）
  → await 信号量（排队超限时发 status{stage:"排队中…"}）
  → 管线 §5.3：DB 读取/落库走 await asyncio.to_thread(run_with_session, fn)（每个 DB 阶段
    独立同步 Session，用完即关——不阻塞事件循环，也隔离 get_db 请求级依赖）
  → LLM 调用 = await AsyncOpenAI（真异步，多个任务并发在等待网络 I/O 上互不阻塞）

SSE 路由 GET（async def，异步生成器）
  → manager.subscribe(run_id)：asyncio.Queue
  → 重放缓冲 + 实时续传；断线在 finally 注销订阅

事件产出两条通道（全部发生在事件循环内，无跨线程竞争）：
  ├─ append 到该 run 的事件缓冲 list（复连回放用，04 决策 #3：完成 + 24h 后清）
  └─ put 到所有活跃订阅者的 queue（实时下发）
```

- 进程内单实例：事件缓冲与运行集都在内存（单用户本地应用，04 确认记录 #3「MVP 内存队列」）；重启丢缓冲，agent_runs 落库可恢复状态。
- `loop` 在 lifespan 启动时捕获并交给 manager；SSE/任务/清理定时器全部跑在同一 loop 上，无跨线程同步问题。
- **并发语义**：不同资源（或不同任务类型）的多个任务同时推进（≥3）；同一 resource key 仍互斥（§5.6 409 `task_running`）；信号量是全局 LLM 并发闸门，防上游打爆，也保响应及时。

### 5.2 TaskDef 与 Registry

```python
# services/agent_tasks/registry.py（结构示意，实现阶段定稿）
@dataclass
class TaskDef:
    prompt_name: str          # 模板名，= agent_runs.prompt_name 留痕
    agent_type: str           # jd_agent / project_agent / resume_agent / hr_agent / asset_assist
    event_mode:  Literal["chunk", "stage"]            # 05 §2.2：文本型 chunk / 结构型 status 阶段
    assemble:    Callable[[Session, dict], dict]      # ① 上下文装配（查库，dict 直接进 Jinja2 变量）
    conflict_key: Callable[[dict], str] | None        # §5.6 资源级互斥，如 f"jd_analyze:{jd_id}"
    handler:     Callable[[TaskCtx], HandlerResult]   # ④⑤ 解析→落库，返回 refs/result
```

模型/温度/max_tokens 按 `prompt_name` 从 config 查（§8），不写死在 TaskDef。

### 5.3 执行管线（05 §2.1 六步落地）

```
① 装配上下文（TaskDef.assemble 查库；单用户默认 user 注入）
     └─ await asyncio.to_thread(run_with_session, assemble)   # DB 阶段 1：读
② 渲染 Jinja2 Prompt（System/User 两段；prompt_name 存 agent_runs）
③ 调用 DeepSeek（流式策略 §5.4；模型分档 §8；超时 §5.7）—— await AsyncOpenAI
④ 解析 + Pydantic Schema 校验（结构化任务；§5.5 兜底）
⑤ 落库 / 组装 done（refs + result）→ 更新 agent_runs（output_refs/tokens/latency/finished_at）
     └─ await asyncio.to_thread(run_with_session, persist)    # DB 阶段 2：写（一次 commit）
⑥ 全程事件：status{stage?} / chunk / done / error
```

- **失败路径**：LLM 上游错误 → `error` 事件 `llm_error`；解析/校验最终失败 → `error`（agent_runs.error 留痕，**不留半成品**：落库动作全部放在管线⑤一次性 commit，中途失败 rollback）；超时 → `task_timeout`。
- **每个 DB 阶段独立同步 Session**（`run_with_session` 开/commit/关；装配段一次读提交，落库段一次写提交）——既复用全部现有同步 repository 签名，又不阻塞事件循环。
- 事件与落库解耦：先落库 commit，再发 done（前端按 done.refs GET 实体时保证已可读）。
- status 事件带 `stage` 展示文案（05 §2.2，协议增量字段，前端已实现兼容渲染）。

### 5.4 流式策略（05 §2.2 落地）

| 任务组 | 事件序列 | LLM 调用方式 |
|---|---|---|
| 文本型（hr_message / assist_chat / assist_questionnaire / polish_self_eval） | `status(running)` → `chunk*` → `done` | 流式，逐 delta 转 chunk 事件 |
| 结构型 chat（jd_analyze / jd_match / project_expression / assist_refill） | `status{stage:…}*` → `done` | 非流式 + `json_object` |
| resume_generate / reflection | 程序阶段间插发 `status{stage:…}` | 非流式；reasoner 思考期发 `status{stage:"正在思考…"}` 占位 |

- `reasoning_content` **一律不下发前端**（05 决定 #10）：客户端只认读、用于判断「思考中」，期间由事件占位保证 UI 有进度（03 §2.8 禁长 spinner）。
- chunk 仅「展示文本」；结构型任务的展示文本由前端按 done 后 GET 实体渲染（04 §3.2），与前端 `useAgentTask` 契约一致。

### 5.5 结构化输出与兜底（05 §2.3 落地）

```
chat 档：response_format={"type":"json_object"}（Prompt 含 "json" 字样）
reasoner 档：围栏 ```json 提取（首个 { 至末 } 平衡解析）

失败 → 同任务重试 1 次：降级 deepseek-chat + json_object
  通过 → 正常落库（agent_runs.error 记 "fallback: reasoner→chat"）
  失败 → error 事件 llm_error，rollback，不留半成品
```

每个结构化产物的 Pydantic Schema 与 02 §6 JSONB 一一对应（§7 任务矩阵列出），**校验通过才落库**（数据库永不写入未校验的 LLM 输出，05 §2.3）。

### 5.6 并发互斥 / 取消 / 超时

| 机制 | 规则 |
|---|---|
| 互斥 | submit 时按 `conflict_key`（内存运行集 + DB 查询 running 任务双重核对）→ 撞车 raise AppError 409 `task_running` |
| 取消 | `POST /agent-runs/{id}/cancel`：置 asyncio.Event 取消标志 → 中断 LLM 请求（client 层 abort 流）；尽力而为（04 §3.2）；agent_runs.status=failed、error 记 "cancelled" |
| 超时 | 每任务两条保险：LLM 请求级超时 110s（asyncio.wait_for）；每任务 watchdog 协程 120s 无新事件 → 置取消标志 + error 事件 `task_timeout` + agent_runs 判 failed（04 §3.2 / 04 §6） |

- 事件缓冲清理：manager 内 async 定时循环每 10 分钟清一次「finished_at 距今 > 24h」的缓冲（04 确认记录 #3）。

### 5.7 SSE 端点（04 §3.2 契约）

```
GET /api/v1/agent-runs/{id}/events
  → 重放缓冲（完成态任务 = 一次性重放全部历史事件后关闭；进行中 = 重放已发生 + 实时续传）
  → 事件格式：event: status|chunk|done|error，data: JSON（与前端 useAgentTask 逐字段对齐）
  → 断线：EventSource 自动重连 → 前端先 GET /agent-runs/{id} 查状态，completed 则跳过订阅直接取实体（前端已如此实现，后端只需保证重放幂等）
```

### 5.8 LLM 客户端封装（OpenAI 兼容）

- 用 **openai 官方 SDK 的 AsyncOpenAI**（async client），`base_url`/`api_key`/`model` 全走 config——换供应商只改配置（05 §5.2）；并发任务共享一个 client（SDK 内部连接池）。
- `reasoning_content`：DeepSeek 透传非标准字段，经 SDK `delta.model_extra` 防御性读取；若实测 SDK 丢弃该字段，模块内降级为 httpx 手解析 SSE（**隔离在本文件**，不影响其余层）。
- `usage`（input/output tokens）：`stream_options={"include_usage": True}` 末 chunk 取，落 agent_runs。
- 上下文预算断言（05 §5.2）：渲染后 Prompt 估算 token > 模型上限 → 显式报错 `input_too_large`，**不静默截断**。
- 每 prompt_name 的有效期/重试策略统一在客户端配置表。

---

## 6. 任务清单矩阵（10 任务）

| prompt_name | agent_type | 触发端点 | 模型档(05 §5.1) | 事件 | 装配输入（repo 查库） | 产物落点 | done.refs | done.result |
|---|---|---|---|---|---|---|---|---|
| jd_analyze | jd_agent | POST /job-descriptions/{id}/analyze | chat | stage | jd.raw_text/title/company | jd_analyses 覆盖更新（analysis 1:1；处理中 status=processing） | {jd_analysis_id} | — |
| jd_match | jd_agent | POST /job-descriptions/{id}/matches | chat | stage | JD 原文+画像 + basic_info + skills(熟练度) + projects + 关联 | jd_matches 留档（+程序算 overall_score 落列） | {jd_match_id} | — |
| project_expression | project_agent | POST /projects/{id}/expressions | chat | stage | 项目全字段 + evidence + type + 最新 confirmed 表达（风格基线） | project_expressions（版本号=该组合最大+1，status=draft；1 个项目最多 3 个 confirm） | {project_expression_id} | — |
| resume_generate | resume_agent | POST /resumes/{id}/versions | reasoner | stage | JD/画像/最新 match + 全资产 + confirmed bullets + instruction + 当前版本内容（regenerate） | resume_versions（version_number+1，content 8 段快照，pending）；content 由 **resume_assembler 程序组装**（事实段拷贝 + LLM 认知段拼接） | {resume_version_id} | — |
| reflection | resume_agent | POST /resume-versions/{id}/reflect | reasoner | stage | 简历完整 8 段 + 资产事实集 + JD keywords | 该版本 reflection_result + reflection_status（passed/issues 确定性判定） | {} | — |
| hr_message | hr_agent | POST /hr-messages | chat | chunk | jd 画像 + basic_info + 简历版本项目/技能段 + scene/mode | hr_messages（生成即保存） | {hr_message_id} | — |
| assist_questionnaire | asset_assist | POST /projects/{id}/assist/questionnaire | chat | chunk | 项目当前字段 + answers[] | 无表 | {} | {follow_up} |
| assist_chat | asset_assist | POST /projects/{id}/assist/messages | chat | chunk | 完整历史 messages[] + 项目字段（无状态，04 决策 #4） | 无表 | {} | — |
| assist_refill | asset_assist | POST /projects/{id}/assist/refill | chat | stage | 完整历史 + 项目当前字段 | 无表 | {} | {fields: 6 认知字段} |
| polish_self_eval | asset_assist | POST /basic-info/polish-self-eval | chat | chunk | 现有 self_evaluation（可空）+ basic_info 其余字段 | 无表 | {} | — |

- `input_refs` 一律只存 UUID 引用（05 §2.4）；结构化输出的校验 Schema 与 02 §6（§6.1~§6.5）一一对应；`resume_generate` 的 LLM 只输出认知三件（projects 含 bullets / skill_order / self_evaluation），**事实段永不经过 LLM**（05 决定 #9）。

---

## 7. 模块实现设计

### 7.1 deterministic 服务（纯函数，配单元测试）

- `scoring.py`：`overall_score = round(100 × Σ(stars×s) / Σ(stars))`（05 §4.2）；`match_score = round(100 × hit/(hit+missing))`，keywords 为空 → null（05 §4.5）。
- `reflection_checks.py`（05 §4.5 ①）：项目存在性；bullets 技术术语 ↔ 该 project tech_stack / 关联 skills 白名单（未命中交 LLM 复核，防同义误报）；数字（%/倍数/数量）必须出现在资产字段。命中项与 LLM issues 合并写 `fabrication`（02 §6.5）；`reflection_status = passed if issues 为空 else issues`。
- `resume_assembler.py`（05 §4.4 表第 1/2/3/4/6 行 + 程序拷贝 name/period/role/tech_stack）：输入 = LLM 认知产物 + 资产，输出 = 02 §6.1 完整 8 段 dict；Master 版条件分支（无 JD 输入、项目按 sort_order、自我评价原样）。

### 7.2 路由模块与端点（04 §4 全覆盖）

| 文件 | 端点组 | 依赖 |
|---|---|---|
| career_assets.py | basic-info ✔（polish-self-eval 待任务框架）+ educations/experiences/honors（含 reorder、PUT 全量语义 **用户自写**） | repos |
| projects.py | projects（q 搜索/级联删/项目状态机暂缺—04 无此端点，确认流转走 project_expressions）+ evidence + skills（PUT 批量替换=事务，services）+ expressions + assist 三端点 | repos + manager |
| jd_analysis.py | job-descriptions CRUD/analyze/analysis/matches（冲突：analyze 409 task_running） | repos + manager |
| resumes.py | resumes CRUD + versions（POST 202/regenerate/reflect/confirm/preview/export）+ PATCH 仅 pending（409 locked_version） | repos + manager + services |
| hr_messages.py / applications.py | CRUD + hr 生成 202；applications 状态机校验（§7.3）+ interview-qa（带出 company/position） | repos + manager |
| agent_runs.py | list（?agent_type=&status=分页）/get/events/cancel（feedback 待 02 v0.4 → 预留） | repos + manager |
| dashboard.py | 统计（§7.3） | repos（SQL 聚合） |

### 7.3 状态与统计

- **applications PATCH status**：任意两态允许流转（PRD 未限定）；`applied_at` 为空且 status ≠ to_apply → 422 `validation_error`（04 §5.6）。
- **resume_versions 状态机**（04 §5.4）：pending → PATCH content；pending/passed/issues → confirm（confirmed_at 落时间，之后 content PATCH 一律 409 `locked_version`）；issues 状态下 confirm 按 04 语义放行（前端二次确认承担）。
- **dashboard SQL 口径**（04 §5.1）：status 计数 + reply_rate=replied↑/applied↑ + asset_progress 四样 + recent_applications 5 条（JOIN resume_versions 带版本号）。

### 7.4 渲染服务（04 决定 #5）

- Jinja2 单模板源：`templates/resume/{classic,modern,minimal}/resume.html.j2` + 共享 `_partials` 8 段；MD 由同一 content dict 走 md 模板渲染。
- `GET …/preview?format=md|html`：resumes.template 为空且 format=html → 409 `template_not_selected`。
- `GET …/export?format=html|pdf`：attachment；PDF 由渲染好的 HTML 经 **playwright（chromium）** 转（Windows conda 环境可行；weasyprint 在 Windows 需 GTK 依赖，不建议），见待确认 #3。

---

## 8. 配置扩展（05 §5.2 落地）

`infrastructure/config.py` 增加（env 可覆盖，默认值 = 05 §3.3 基线）：

```text
LLM_MODEL_CHAT       = deepseek-chat        # 常规档
LLM_MODEL_REASONER   = deepseek-reasoner    # resume_generate / reflection
LLM_MODEL_<PROMPT>   （可选覆盖）
LLM_TEMPERATURE_<PROMPT> / LLM_MAX_TOKENS_<PROMPT>   （默认取 §3.3 基线表）
LLM_OVERRIDES        = '{"resume_generate": {"max_tokens": 8192}, …}'   # JSON env 整体覆盖基线表
LLM_CONTEXT_LIMIT_CHAT / LLM_CONTEXT_LIMIT_REASONER   # §5.8 断言用
AGENT_MAX_CONCURRENCY = 3                    # §5.1 并发信号量（≥3，env 可调）
LLM_REQUEST_TIMEOUT   = 110                  # §5.6 LLM 请求级超时（秒）
AGENT_TASK_TIMEOUT    = 120                  # §5.6 watchdog 无进展超时（秒）
```

## 9. 依赖与数据库演进

- requirements.txt 增加：`openai`、`jinja2`、`playwright`（+ `playwright install chromium` 一次性安装）。
- **agent_runs.feedback**（05 待确认 #4，03 §4.1 👍/👎）：需 02 升 v0.4 补列（TEXT NULL），models.py 同步 + 已落库表执行一次性 `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS feedback TEXT`（脚本留档 docker/）；此后启用 `POST /agent-runs/{id}/feedback`。
- 建表仍走 lifespan `init_db()` 幂等 create_all；MVP 不引入 Alembic（单用户开发期，结构变更=改模型+一次性 SQL 留档），见待确认 #5。

## 10. 实施顺序（每步交付后可验收）

| 里程碑 | 内容 | 验收 |
|---|---|---|
| ✅ M1 框架打通 | config 扩展 + llm_client + events/manager/registry 骨架 + agent_runs 路由（list/get/events/cancel）+ 依赖安装 | jd_analyze 手工触发走通全部事件+落库 ✅ smoke_m1 37/37（2026-09-07 回归） |
| ✅ M2 chat 任务 | jd_analyze → hr_message（chunk）→ jd_match（程序算分）→ project_expression → assist 三件+polish | ✅ smoke_full §2–§5（表达版本留档 / follow_up / fields 七字段 / self_evaluation） |
| ✅ M3 reasoner 重任务 | resume_assembler + resume_generate → reflection（程序校验+LLM 自检） | ✅ smoke_full §6（Master 版 8 段快照 + confirmed bullets + 技能排序；JD 版 v2；reflect passed + ReflectionResult 契约；regenerate v3） |
| ✅ M4 确定性服务 | rendering（3 模板 + PDF）+ dashboard | ✅ smoke_full §6 preview/export（azi-loc 锚点 / template_not_selected / classic 回退 / pdf 501 未装 playwright）+ §8 dashboard |
| ✅ M5 CRUD 收尾 | （用户节奏）educations 等 + applications/状态机 + interview-qa(带出) | ✅ smoke_full §1/§8（reorder 全量集语义 / 422 字段级 details / 公司岗位带出） |
| M6 联调 | VITE_USE_MOCK=false 全链路冒烟 | ✅（2026-09-08）页面级：`scripts/m6_walk.py` headless 走 16 路由，控制台/未捕获异常/API 4xx-5xx 全零，真实数据渲染（vite 代理 /api→8000，同源无需 CORS）。交互级（页面内点生成/编辑/导出按钮走完整任务流）留用户人工过一遍 |

## 11. 实现注意事项（已有约定汇总，防重蹈）

- conda 环境执行一切命令；Windows git-bash curl 测中文用 `--data-binary @utf8文件`（GBK 坑）。
- `conda run` 加 `PYTHONUTF8=1`（UnicodeEncodeError 坑）。
-（2026-09-08 补）`conda run` 会**整体缓冲子进程输出**，起 uvicorn/vite 等长驻服务时日志文件恒为空且 TaskStop 杀不掉孙进程（node/python 残留占端口）——长驻服务一律直接调环境内二进制（`D:/miniconda/envs/ai-job-copilot/python.exe -m uvicorn …` / `…/npm.cmd run dev`）。
-（2026-09-08 补）vite dev 只监听 IPv6 `::1`，`curl 127.0.0.1:5173` 连不上，须 `curl localhost:…`；端口被占时 vite 静默跳 5174（看启动日志）。
-（2026-09-08 补）playwright 1.62 的 `launch(headless=True)` 默认找 `chromium_headless_shell-1234`，`playwright install chromium` 会同时下两份——中途打断会出现「完整 chromium 在、headless shell 缺」的 500；`PDF_BROWSER_CHANNEL=msedge/chrome` 可用系统浏览器兜底。
- 任务线程内禁止用 `Depends(get_db)` 的 Session——自开 SessionLocal，任务结束 finally close。
- 枚举列 CHECK 已由 checked_enum 保障（create_constraint=True 坑已填）。
- serialize_by_alias=True 用于任何带 alias 的响应模型（Links 坑已填）。

## 12. 决定记录

| # | 决定 | 理由 |
|---|---|---|
| 1 | **任务执行 = asyncio 协程**（用户确认，v0.2）；DB 保持同步栈，任务内以 `to_thread + 独立 Session` 做 DB 阶段 | 用户要求并发 ≥3 任务且按规范架构；异步只在任务/SSE/LLM I/O 侧引入，既有同步路由与 repo（含用户正在自写的部分）零改动，改动面最小、并发收益最大 |
| 2 | **全局信号量 AGENT_MAX_CONCURRENCY（默认 3，env 可调）** 作为 LLM 并发闸门；超限任务排队并广播 `stage:"排队中…"` | 用户要求至少 3 任务同时处理；信号量防上游打爆，排队语义对前端透明 |
| 3 | SSE 订阅 = async 生成器 + 每 run asyncio.Queue + 缓冲重放 | 任务在事件循环内产出事件，queue 直接投递零锁；复连重放幂等是硬需求（04 §3.2），缓冲即数据源 |
| 4 | openai 官方 SDK 的 AsyncOpenAI 封装，reasoning_content 防御性读取 | 05 §5.2「换模型只改配置」；SDK 字段透传风险隔离在 llm_client 一个文件 |
| 5 | 落库 commit 先于 done 事件 | 前端按 done.refs GET 实体必须读到（04 §3.2 时序），失败事务则只发 error |
| 6 | 每个 DB 阶段独立同步 Session（run_with_session：开→commit→关） | 复用全部同步 repository 签名；Session 不跨 await 持有，避免跨线程/悬挂事务坑 |
| 7 | PDF 用 playwright（chromium） | Windows conda 环境可装（weasyprint 需 GTK）；04 确认记录 #5 授权实现阶段选型 |

## 12.5 横切关注点（规范架构落地）

| 关注点 | 方案 |
|---|---|
| 集中错误处理 | 已有：AppError + main.py 双异常处理器（AppError/RequestValidationError → 04 §2.2 ErrorEnvelope），任务协程内不抛 HTTP，只产 error 事件 |
| 结构化日志 | `logging` 标准库：manager/任务/SSE 各记关键节点（submit / start / fallback / done / error），行内带 agent_run_id 便于追踪；LLM 调用记 model + latency |
| 配置管理 | pydantic-settings 分层：必需项（key/base_url/model）+ 分档覆盖（§8）+ 任务基线表（05 §3.3 静态表 + env LLM_OVERRIDES JSON 可选整体覆盖） |
| 依赖注入 | 路由层 Depends(get_db)；任务协程不共享请求 Session（§12 决定 #6）；manager/registry 模块级单例，lifespan 装配 |
| 资源生命周期 | 事件缓冲 24h 清理、运行集/信号量随任务结束释放、client 单例复用、Session finally 关闭 |

## 13. 待确认问题（v0.2 定稿）

| # | 问题 | 结论（2026-09-05 用户指示） |
|---|---|---|
| 1 | Agent 框架同步后台线程 vs 异步 | **异步**（asyncio 协程 + 信号量并发 ≥3）——已改 §5.1，决定 #1/#2 |
| 2 | 05 全篇「初稿待确认」的 8 个待确认项 | 按用户「按照规范的形式构建」指示**全部沿用 05 建议值**；其中 feedback 补列待 02 v0.4 落（§9） |
| 3 | PDF 引擎 | playwright（chromium，Windows 友好；首次安装下载 ~150MB）——M4 实施 |
| 4 | LLM SDK | openai 官方 SDK（AsyncOpenAI，DeepSeek 官方兼容）——M1 起用 |
| 5 | 数据库演进 | MVP 不引 Alembic：create_all + 一次性 ALTER SQL 留档（docker/） |
| 6 | 新增错误码 `input_too_large`（422） | 新增，回写 04 §6 码表（04 待升 v0.3） |
| 7 | 分工 | CRUD 用户自写我 review；任务框架/渲染/确定性服务我实现——沿用 |
| 8 | 时间戳 UTC（Z）vs 容器 +08:00 | 暂缓：待 04 升版或联调期定；前端 JS 两种均能解析 |

## 14. 对照检查清单

- [x] 端点与 04 §4 全覆盖（含 202 任务端点的 refs/result 语义、409/422 边界）
- [x] 事件协议与 04 §3.2 + 前端 useAgentTask 契约一致（status/chunk*/done/error；stage 为可选增量）
- [x] 任务矩阵与 05 §1.3 一致（agent_type×prompt_name 10 行，无新增端点，无表结构变更）
- [x] 结构化产物 Pydantic↔02 §6 一一对应；数据库不落未校验 LLM 输出（05 §2.3）
- [x] 确定性职能（计分/事实段/状态判定/统计）全部程序侧（PRD §3.3、05 决定 #8/#9）
- [x] 分层与现有代码一致（api/schemas/repositories/services；errors.py AppError 通道复用）
- [x] agent_runs.feedback：已实现（POST /agent-runs/{id}/feedback，可覆盖；02 v0.4 列已落库）✅

## 15. 契约差异记录（实现期发现，前端契约为准）

依据 §1「前端契约零映射」：遇差异时**前端契约是真相源**，后端适配；本节留档，供 04/02 升版时回写。

| # | 位置 | 04/02 原设计 | 前端契约（已落地） | 后端适配 |
|---|---|---|---|---|
| 1 | AgentRun.read.tokens | 表分 input_tokens / output_tokens 两列 | 单字段 tokens（合计） | Read DTO 合并展示；DB 两列保留（留档保留细粒度） |
| 2 | AgentRun.read.error | 04 §3.2 未定义错误对象形状 | `{"code","message"}` 对象；成功为 null | DB 落 JSON 字符串；读取时解析（`{"code":"ok"}` → None，其余 → 对象），见 schemas/agent_runs.py `_parse_error` |
| 3 | agent-runs 列表过滤 agent_type | 02 枚举 agent_type（jd_analyze 等） | 前端参数可能传 prompt_name 值（如 hr_message_china） | 双重过滤 `or_(prompt_name==v, agent_type==v)`；展示字段透出对应值。不明取值一律视为 prompt_name |
| 4 | GET /job-descriptions/{id}/analysis 无行 | （未定义） | `JDAnalysis \| null`（200 + `{"data": null}`） | 无分析行返回 200 null；仅 JD 不存在 404（前端 mock 同语义） |
| 5 | JobDescriptionRead | 表列固定集 | 多出 `latest_match_score` 字段 | DB 不落列；列表/详情经子查询带出（该 JD 最新 jd_match.overall_score，无匹配 null） |

SSE 事件协议（status/chunk*/done/error 及其数据形状）已与前端逐字段对齐，见 §5.7，不重复记录。
- [ ] 鉴权/限流：单用户本地 MVP 不配置（04 §10 已豁免）