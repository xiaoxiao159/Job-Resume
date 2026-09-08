# 05 Agent 设计（Agent Design）

> 项目：AI Job Copilot
> 依据：PRD.md v0.4 · 01-feature-design.md v0.4（决定 #3/#9）· 02-data-model.md v0.3 · 03-ui-ux-design.md v0.2 · 04-api-design.md v0.2
> 版本：v0.1
> 状态：初稿待确认
> 更新：2026-09-04
> 技术前提：FastAPI · LLM = DeepSeek（OpenAI 兼容 API，用户确认 2026-09-04）· 模型按 Agent 分档（用户确认）· backend/prompts/ Jinja2 管理（01 决定 #9）· 所有 LLM 调用走 04 §3 统一任务协议

## 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-09-04 | 初稿：Agent 清单与编排定位、统一执行框架（流式/结构化输出/兜底）、Prompt 管理规范、7 类 Agent 详细设计、匹配度算法（01 决定 #3 闭环）、模型分档、认知/确定性装配分工 |

---

## 1. 定位与总体架构

### 1.1 设计原则 → Agent 设计落实

| PRD 原则 | Agent 设计落实 |
|---|---|
| LLM 负责认知，程序负责确定性（§3.3） | 上下文装配、评分计算、事实段组装、Pydantic 校验、落库全部由程序完成；LLM 只做理解 / 分类 / 改写 / 生成（§4.4 装配分工） |
| Evidence First（§3.1） | 每个生成型 Agent 的 Prompt 注入统一安全边界（§3.2 _partials/safety_rules）；Reflection 程序校验 + LLM 自检双保险（§4.5） |
| Human-in-the-loop（§3.4） | 所有生成走 04 §3 任务协议（触发 → 流式 → 待确认），不存在"生成并直接生效"路径 |
| Prompt 统一管理（01 决定 #9） | 全部 Prompt 落 backend/prompts/，Jinja2 模板，agent_runs.prompt_name 留痕（§3） |

### 1.2 不做 Supervisor LLM（决定 #1）

PRD §13 提出 Supervisor + 专用 Agent 的架构。落地修正：

- MVP 的每个 AI 能力都由用户**明确点击按钮**触发对应端点（04 端点表），意图路由是**确定性的**（URL → agent_type → prompt），Supervisor LLM 理解意图再路由没有任何增量价值，只增加延迟、成本与不确定性；
- "Supervisor" 的编排职责由后端服务层 **AgentRunner** 承担：装配上下文 → 渲染 Prompt → 调用 DeepSeek → 校验 → 落库 → 发事件（§2.1 统一管线）；
- V2 若引入自由对话入口（自然语言下达求职任务），再评估 Supervisor / 路由 Agent。

```text
用户动作（确定性路由）
   ↓
┌────────────────────── AgentRunner（代码，无 LLM）──────────────────────┐
│ ① 装配上下文（查库）  ② 渲染 Jinja2 Prompt  ③ DeepSeek 调用            │
│ ④ 结构解析 + Pydantic 校验  ⑤ 落库 + done/error 事件（SSE）            │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.3 Agent 清单（agent_type × prompt_name）

agent_type 五个值沿用 02 §4.19；子任务用 prompt_name 区分。**无需改表**。

| agent_type | prompt_name | 触发端点（04） | 模型档 | 流式行为 | 产物落点 |
|---|---|---|---|---|---|
| jd_agent | jd_analyze | POST /job-descriptions/{id}/analyze | chat | status 阶段事件 | jd_analyses（02 §4.12） |
| jd_agent | jd_match | POST /job-descriptions/{id}/matches | chat | status 阶段事件 | jd_matches（02 §4.13） |
| project_agent | project_expression | POST /projects/{id}/expressions | chat | status 阶段事件 | project_expressions（02 §4.10） |
| resume_agent | resume_generate | POST /resumes/{id}/versions | reasoner | status 阶段事件 | resume_versions（02 §4.15） |
| resume_agent | reflection | POST /resume-versions/{id}/reflect | reasoner | status 阶段事件 | resume_versions.reflection_* |
| hr_agent | hr_message | POST /hr-messages | chat | **chunk 流式** | hr_messages（02 §4.16） |
| asset_assist | assist_questionnaire | POST /projects/{id}/assist/questionnaire | chat | **chunk 流式** | 无表（done.result） |
| asset_assist | assist_chat | POST /projects/{id}/assist/messages | chat | **chunk 流式** | 无表 |
| asset_assist | assist_refill | POST /projects/{id}/assist/refill | chat | status 阶段事件 | 无表（done.result.fields） |
| asset_assist | polish_self_eval | POST /basic-info/polish-self-eval | chat | **chunk 流式** | 无表（done.result） |

---

## 2. 统一执行框架（AgentRunner）

### 2.1 执行管线

所有 10 个任务走同一条管线（决定 #7）：

```text
① 装配上下文（程序查库，§4 各 Agent 输入清单）
② 渲染 Jinja2 Prompt（System + User，§3.2）
③ 调用 DeepSeek（流式 / 非流式按 §2.2）
④ 结构解析 + Pydantic 校验（§2.3 兜底）
⑤ 落库 / 组装 done 事件（refs + result）→ agent_runs 留痕
```

失败路径：LLM 上游错误 → error 事件 `llm_error`（502）；解析/校验最终失败 → error 事件（02 §4.19 error 列留痕）；任务超时 120s 判 failed（04 §3.2）。

### 2.2 流式策略（决定 #6）

规则：**文本型任务流式（chunk = 最终展示文本本身）；结构型任务非流式，用 status 阶段事件给进度反馈**。不做"流式展示 + 事后单独结构化提取"的两段调用（成本 ×2，且结构化可靠性用 §2.3 兜底解决）。

| 任务 | SSE 事件序列 |
|---|---|
| 文本型（hr_message / assist_chat / assist_questionnaire / polish_self_eval） | `status(running)` → `chunk*`（逐字文本）→ `done{refs/result}` |
| 结构型（jd_analyze / jd_match / assist_refill / project_expression） | `status{running, stage:"正在分析岗位职责…"}` → `status{…, stage:…}` → `done{refs/result}` |
| resume_generate / reflection（程序多阶段） | 程序阶段间插发 status（`stage:"正在装载资产…"` → `stage:"正在生成简历…"` → `stage:"正在校验…"`）→ `done` |

- status 事件 data 在 04 §3.2 基础上**增加可选 `stage` 字段**（展示用文案），协议形状不变，前端仅渲染。
- deepseek-reasoner 流式响应先返回 `reasoning_content`（思考链）后返回 `content`。**reasoning_content 一律不下发前端**；长思考期间由后端发 `status{stage:"正在思考…"}` 占位（展示节奏见待确认 #2）。
- 结构型任务的展示文案（如 JD 画像卡片）由 done 后前端 GET 实体渲染（04 §3.2），非 chunk。

### 2.3 结构化输出与兜底（决定 #4）

DeepSeek 两档模型对 JSON 输出支持不同：

| 档位 | 机制 | 说明 |
|---|---|---|
| deepseek-chat | `response_format={"type":"json_object"}` | Prompt 中必须出现 "json" 字样；输出即合法 JSON |
| deepseek-reasoner | **不支持 json_object** | Prompt 强约束（输出必须为 ```json 围栏内完整 JSON，无任何其他文本）+ 提取器（围栏 → 首个 `{` 至末 `}` 平衡解析） |

统一兜底管线（两档共用）：

```text
原始输出 → 提取 JSON → Pydantic Schema 校验
  ├─ 通过 → 落库 / done
  └─ 失败 → 同任务重试 1 次，降级 deepseek-chat + json_object
             ├─ 通过 → 落库（agent_runs 记录降级事实）
             └─ 失败 → error 事件 llm_error，不留半成品
```

- 所有结构化产物必须通过对应 Pydantic Schema（与 02 §6 JSONB 结构一一对应）才落库/下发——数据库永不写入未校验的 LLM 输出。
- 校验规则要点：字段类型、枚举值、列表元素结构；文本字段不做字数上限（content 快照等自由文本）。

### 2.4 留痕与可观测性

- agent_runs 落位（02 §4.19）：`prompt_name`（模板名）、`model`（实际调用模型，含降级）、`input_refs` / `output_refs`（实体引用）、`tokens` / `latency_ms` / `error`。
- 降级重试的事实写入 `error` 附加说明（如 `fallback: reasoner→chat`），后续调 Prompt 有据可查。
- 03 §4.1 的 👍/👎 反馈按钮要求记录进 agent_runs，但 02 §4.19 **没有 feedback 字段**——见待确认 #4，需 02 升版补 `feedback` 列。

---

## 3. Prompt 管理

### 3.1 目录结构（backend/prompts/）

```text
backend/prompts/
├── _partials/                    # 共享片段（Jinja2 include）
│   ├── safety_rules.md.j2        # 安全边界（禁编造清单，PRD §8.5）
│   ├── json_rules.md.j2          # JSON 输出规范（围栏/字段名/无注释）
│   └── asset_facts.md.j2         # 资产事实集渲染（项目/技能/教育…）
├── jd_analyze.md.j2
├── jd_match.md.j2
├── project_expression.md.j2      # type 参数化（resume_bullet|interview|star）
├── resume_generate.md.j2
├── reflection.md.j2
├── hr_message.md.j2
├── assist_questionnaire.md.j2
├── assist_chat.md.j2
├── assist_refill.md.j2
└── polish_self_eval.md.j2
```

### 3.2 模板规范

1. **两段式结构**：System = 角色 + 任务 + 安全边界（include safety_rules）+ 输出契约（include json_rules）；User = 上下文数据 + 本次任务指令。数据与指令分离，Jinja2 变量注入数据。
2. **文件头注释**：`{# 用途 / 对应端点 / 版本 / 最近变更日期 #}`——Prompt 本身也带版本，配合 agent_runs.prompt_name 可追溯（Prompt 变更走 Git 历史，不单独建版本表）。
3. **语言约定（决定 #5）**：正文与指令用中文（任务域即中文简历/JD）；JSON 字段名用英文并与 02 §6 结构完全一致，禁止翻译字段名。
4. **单一职责**：一个模板只做一个任务；跨任务共享的内容进 _partials，禁止复制粘贴。
5. **few-shot 策略**：分类类任务（jd_match 三态判定、reflection 编造判定）给 1 个标注示例稳定输出；生成类任务（resume / expression / hr）零样本 + 严格输出契约（DeepSeek 对中文结构化任务零样本表现稳定，示例随实现阶段调试再补）。

### 3.3 调用参数基线

| prompt_name | 档位 | temperature | max_tokens | 说明 |
|---|---|---|---|---|
| jd_analyze | chat | 0.1 | 4096 | 抽取任务，低温度求稳定 |
| jd_match | chat | 0.1 | 4096 | 分类任务，低温度 |
| project_expression | chat | 0.3 | 4096 | 表达生成，平衡一致性与多样性 |
| resume_generate | reasoner | —（忽略） | 8192 | 质量敏感，reasoner 不支持 temperature |
| reflection | reasoner | —（忽略） | 8192 | 精确核对，最忌幻觉 |
| hr_message | chat | 0.7 | 2048 | 文案生成，需要变化（防模板化） |
| assist_chat | chat | 0.7 | 2048 | 对话 |
| assist_questionnaire | chat | 0.3 | 2048 | 深挖问题生成 |
| assist_refill | chat | 0.1 | 4096 | 提炼回填，稳定优先 |
| polish_self_eval | chat | 0.3 | 2048 | 润色 |

> 模型 ID 与各档上下文/输出上限以 DeepSeek 官方文档为准，实现阶段核对后固化到配置（§5.2）。本项目单次调用上下文（JD + 资产集）远小于 64K，无截断风险；仍禁止静默截断——资产超预算时应显式报错而非裁剪（见 §5.2 配置说明）。

---

## 4. 各 Agent 详细设计

### 4.1 JD Agent（jd_analyze）

- **职责**：JD 文本 → 岗位画像（PRD §7.2 处理流程的单次 LLM 抽取）。
- **输入装配**：job_descriptions.raw_text + title/company（可选，供画像标题参考）。
- **输出 Schema**（= 02 §6.2，落 jd_analyses）：

```jsonc
{
  "title": "AI 应用工程师",
  "core_skills":   [{"name": "Python", "stars": 5}],   // 核心技能，stars ∈ {4,5}
  "plus_skills":   [{"name": "Docker", "stars": 3}],   // 加分项，stars ∈ {1,2,3}
  "responsibilities": ["Agent 应用开发", "…"],
  "experience_requirement": "3-5 年",
  "education_requirement": "本科及以上",
  "keywords": ["Agent", "RAG", "LangGraph"]
}
```

- **要点**：
  - 星级规则：核心技能 = 岗位必须项（JD 明确要求，stars 4~5）；加分项 = 锦上添花（nice-to-have，stars 1~3）；职责/要求中未提及的不收录。
  - 技能名保留 JD 原文写法（不翻译、不缩略，如 JD 写 "Kubernetes" 不写 "k8s"），供后续匹配与关键词一致性。
  - 岗位职责提炼为动作短语（"RAG 系统开发"），每条 ≤ 30 字；keywords 为简历命中用关键词（技能名 + 领域词）。

### 4.2 JD Match（jd_match）★ 匹配度算法（01 决定 #3 闭环）

**两步设计：LLM 负责语义分类，程序负责算分（决定 #2、#8）。**

#### 第一步：LLM 语义匹配（认知）

输入：JD 原文 + jd_analyses 画像 + basic_info（求职意向）+ skills（含熟练度）+ projects（name/summary/tech_stack/results）+ project_skills 关联。

LLM 输出（= 02 §6.4，**不含 overall_score**）：

```jsonc
{
  "skill_matches": [                    // 每个 JD 技能恰好一条，覆盖 core+plus 全部
    {"name": "Python",   "status": "strong",  "matched_asset": "技能 Python(expert)"},
    {"name": "Docker",   "status": "partial", "matched_asset": "项目 X 使用容器化部署"},
    {"name": "Redis",    "status": "missing", "matched_asset": null}
  ],
  "matched_project_ids": ["uuid…"],     // 相关项目（依据 project_skills 关联 + 描述相关性）
  "advantages": ["有完整 Agent 项目", "…"],
  "gaps": ["缺少 Redis 实践", "…"]
}
```

三态判定规则（写入 Prompt，附 1 个 few-shot 示例）：

| 状态 | 判定标准 |
|---|---|
| strong | JD 技能与资产技能/项目技术栈直接命中或明确同义（含中英同义，如 JD "PyTorch" ↔ 资产 "Pytorch/深度学习框架"） |
| partial | 语义相邻（JD "向量数据库" ↔ 资产 "FAISS/Embedding 经验"）、同族（JD "Redis" ↔ 资产 "消息队列实践"）、或资产有相关实践但深度不足 |
| missing | 资产中无任何相关技能、项目、经历 |

#### 第二步：程序计算 overall_score（确定性，决定 #8）

```
overall_score = round( 100 × Σ(stars × s) / Σ(stars) )
其中 s = strong→1.0，partial→0.5，missing→0
```

示例（PRD §7.4 数据）：core {Python 5, RAG 5, LangGraph 4, FastAPI 4} + plus {Docker 3, Redis 2}；strong 4 项，partial 1 项（Docker），missing 1 项（Redis）：

```
Σ(stars×s) = 5+5+4+4 + 0.5×3 + 0×2 = 19.5
Σ(stars)   = 5+5+4+4 + 3 + 2       = 23
overall_score = round(100 × 19.5/23) = 85
```

- LLM 输出中**禁止出现任何数值评分**（防 LLM 估算，PRD §3.3）；`overall_score` 与 `skill_matches` 落 jd_matches（02 §4.13，overall_score 冗余 NUMERIC 列便于排序统计）。
- 部分匹配固定 0.5，不细分程度——保持公式可解释；如需更细可 V2 引入 LLM 置信度。
- 城市不符等意向提示：basic_info 求职意向传入 Prompt，命中时写入 gaps（如 "意向城市上海，该岗位 base 北京"）。
- matched_project_ids 是 resume_generate 选取项目的重要依据（§4.4）。

### 4.3 Project Agent（project_expression）

- **职责**：项目资产 → 求职场景表达（简历版 / 面试版 / STAR 版），不依赖 JD（M3）。
- **输入装配**：项目全字段（name/summary/background/goal/role/tech_stack/responsibilities/core_work/difficulties/solutions/results/demo/github）+ evidence 类型列表 + `type` 参数 + 该 (project, type) 下最新 confirmed 表达（若存在，作为风格基线供参考，避免新旧版本风格漂移）。
- **输出 Schema**（= 02 §6.3，三选一按 type）：

```jsonc
// resume_bullet（1~3 条，每条 ≤ 40 字）
{"bullets": ["基于 LangGraph 构建 RAG Agent Workflow，完成知识库检索、重排与生成流程的模块化编排。", "…"]}

// interview（六段）
{"background": "…", "responsibility": "…", "architecture": "…",
 "difficulty": "…", "solution": "…", "result": "…"}

// star
{"situation": "…", "task": "…", "action": "…", "result": "…"}
```

- **要点**：
  - 简历版 Bullet 必须含技术关键词 + 动词开头 + 成果量化（成果数字只能来自资产字段）；优先覆盖技术难点与解决方案的提炼。
  - 面试版 6 段每段 100~200 字，架构段含技术栈；STAR 版严格四段。
  - 安全边界：全部内容只能来自输入的项目字段，无事实支撑不扩写（include safety_rules）。
- 确认/编辑/留档语义由 04 §5.2 端点承担（本项目无新增设计）。

### 4.4 Resume Agent（resume_generate）★ 认知/确定性装配分工（决定 #9）

- **职责**：JD + 资产 → 整份定制简历的**认知部分**；程序负责**事实部分**与快照组装。
- **装配分工**（"LLM 负责认知，程序负责确定性"的落地）：

| 8 段（02 §6.1） | 谁负责 | 说明 |
|---|---|---|
| 1 基本信息 | 程序 | 直接拷贝 basic_info；LLM 不参与姓名/联系方式 |
| job_intention | 程序 | 拷贝求职意向 |
| 2 教育背景 | 程序 | 全量拷贝（含 period 格式化、courses） |
| 3/4 科研/校园 | 程序 | 全量拷贝，空则 `[]`（模板自动隐藏，F5.3） |
| 5 项目经历 | **LLM** | 选取（用最新 jd_match 的 matched_project_ids + JD 画像）、排序、bullets 措辞；name/period/role/tech_stack 由程序从资产拷贝，**LLM 不输出这些事实字段** |
| 6 荣誉证书 | 程序 | 全量拷贝，空则 `[]` |
| 7 专业技能 | **LLM** | JD 相关技能前置突出（展示层调整，01 决定：资产不被改写）；name/proficiency 程序拷贝，LLM 只输出排序结果 |
| 8 自我评价 | **LLM** | 基于现有 self_evaluation JD 化改写（无 self_evaluation 则输出 null，程序不编造） |

- **LLM 输出 Schema**（仅认知部分，程序按此组装完整 8 段快照）：

```jsonc
{
  "projects": [                    // 顺序即简历顺序（JD 相关在前）
    {"id": "uuid…", "bullets": ["…", "…"]}
  ],
  "skill_order": ["uuid…", "…"],   // 全量技能的重排序列
  "self_evaluation": "…"           // 可为 null
}
```

- **bullets 生成规则**：优先取该 (project, resume_bullet) **最新 confirmed** 表达原文（02 §4.10 取用规则）；无 confirmed 时基于项目字段提炼；存在用户 `instruction`（regenerate 的修改意见，04 §5.4）时允许 JD 化微调，但不得新增资产外事实。
- **输入装配清单**（程序查库）：
  1. JD：raw_text + jd_analyses 画像 + 最新 jd_match（含 matched_project_ids）；
  2. 资产：basic_info（含求职意向/自我评价）、educations、experiences、honors、skills（含熟练度与项目关联）、projects 全字段；
  3. 表达：各项目最新 confirmed resume_bullet（无则项目字段）；
  4. `instruction`（可选，regenerate 时的用户修改意见）；
  5. regenerate 时附当前版本 content 快照（供对照修改而非推倒重来）；
  6. jd_id 为空 = Master 版：无 JD 画像/匹配输入，项目全量、按 sort_order、bullets 取 confirmed 表达、自我评价原样保留。
- **要点**：Master 版与 JD 版共用同一模板（Jinja2 条件渲染 JD 相关段落）；LLM 输出不含任何联系方式/日期格式化/教育等事实段——事实由程序拼装，出错面最小化。

### 4.5 Reflection（reflection）★ 程序校验 + LLM 自检

- **职责**：简历版本 vs 资产事实与 JD 要求的验证（F4.5）。
- **结构：两阶段，程序先校验，LLM 复核**（02 §6.5）：

```
① 程序校验（确定性，决定 #8）
   a. 项目存在性：content.projects[].name 必须存在于资产 projects
   b. 技术栈：bullets 中出现的技术术语必须能匹配该项目 tech_stack / 关联 skills（白名单；未命中 → 交 LLM 复核，防同义误报）
   c. 数字：bullets/self_evaluation 中的数字（%、倍数、数量、金额）必须在项目资产字段出现过
② LLM 自检（认知）：输入 = 简历完整 8 段 + 资产事实集（_partials/asset_facts），逐项核对
```

- **LLM 输出 Schema**（fabrication 部分）：

```jsonc
{
  "issues": [                        // 空数组 = 通过
    {"location": "projects[0].bullets[1]", "claim": "性能提升 50%",
     "type": "number_not_in_assets"}   // number_not_in_assets | tech_not_in_assets
                                       // | project_not_in_assets | other
  ]
}
```

- 程序校验命中项与 LLM 自检结果合并写入 `fabrication`（02 §6.5 结构）；**reflection_status 由后端确定性判定**：issues 为空 → `passed`，否则 → `issues`（04 §5.4 状态机一致）。
- **coverage 与 match_score**：输入 JD keywords + 简历文本，LLM 逐 keyword 判 `hit/missing`（语义覆盖）；程序计算 `match_score = round(100 × hit / (hit+missing))`（keywords 为空时 match_score = null）。LLM 只分类、不算分（决定 #8）。

### 4.6 HR Agent（hr_message）

- **职责**：开场白文案（M6）。
- **输入装配**：jd_analyses 画像（岗位名/职责/关键词）+ basic_info（姓名/求职意向）+ resume_version content（取项目段与技能段，用于"我有什么相关经历"）+ scene/mode 参数。
- **输出**：纯文本（chunk 流式），落 hr_messages.content。
- **要点**：scene/mode 以 Jinja2 条件段注入格式要求（Boss直聘：短句、口语化；邮件：正式称呼与落款；技术版：术语密度高）；结构 = 我是谁 + 相关经历 + 为什么匹配 + 希望沟通（PRD §10.3）；显式禁止套话（"尊敬的 HR 您好，我非常荣幸…"）；只能引用简历内已有事实。

### 4.7 Asset Assist（asset_assist 四任务）

| 任务 | 输入 | 输出（done.result / chunk） | 要点 |
|---|---|---|---|
| assist_questionnaire（第一段） | 项目当前字段 + 问卷答案数组 | 流式 `follow_up` 深挖问题（1~2 个，直击薄弱字段） | 挑 4 组字段中最薄弱的深挖；答案已覆盖的点不再问 |
| assist_chat（第二段多轮） | 完整对话历史（前端全量发送，04 决策 #4）+ 项目字段 | 流式回复文本 | 角色 = 求职盘点教练；深挖"为什么/怎么解决/具体贡献/量化结果"；不改写、只追问与记录 |
| assist_refill（停止回填） | 完整对话历史 + 项目当前字段 | `{fields: {background, goal, responsibilities, difficulties, solutions, results}}`（04 §5.2 ③） | 只回填 6 个认知字段（summary/role/tech_stack 等事实字段不进 AI）；字段值与对话事实一致，无支撑不写；**summary 由程序从 background/goal 提炼？否——summary 不在回填范围** |
| polish_self_eval | 现有 self_evaluation（可空） | 流式建议文本 | 空输入时引导式产出草稿（基于 basic_info 其他字段）；非空则润色不改事实 |

---

## 5. 模型分档与配置（决定 #3，用户确认 2026-09-04）

### 5.1 分档表

| 档位 | 模型 | 承担任务 | 理由 |
|---|---|---|---|
| 认知重任务 | deepseek-reasoner | resume_generate、reflection | 整份简历的选取/排序/JD 化与编造核对是全局推理型任务，质量敏感 |
| 常规任务 | deepseek-chat | jd_analyze、jd_match、project_expression、hr_message、assist_*、polish_self_eval | 抽取/分类/改写型任务，chat 档质量足够且支持 json_object（可靠性高） |

### 5.2 配置方式

- 环境变量 / 后端 config，按 prompt_name 覆盖默认值（实现阶段落 config.py）：

```text
LLM_BASE_URL=https://api.deepseek.com        # OpenAI 兼容端点
LLM_API_KEY=…
LLM_MODEL_DEFAULT=deepseek-chat
LLM_MODEL_RESUME_GENERATE=deepseek-reasoner  # 重任务覆盖
LLM_MODEL_REFLECTION=deepseek-reasoner
LLM_MAX_TOKENS_*=…  /  LLM_TEMPERATURE_*=…   # 按 §3.3 基线，可覆盖
```

- 换模型只改配置不改代码（OpenAI 兼容协议；将来切供应商/加模型同理）。
- 上下文预算：实现阶段按官方文档核对上下文上限并配置断言；资产集超预算时**显式报错**（提示用户精简资产）而非静默截断。

---

## 6. 检查清单（与前序文档一致性）

- [x] agent_type 五个值沿用 02 §4.19，prompt_name 区分子任务，无表结构变更
- [x] 全部输出 Schema 与 02 §6 JSONB 结构一一对应（analyze→§6.2、match→§6.4、expression→§6.3、resume→§6.1、reflection→§6.5）
- [x] 流式/事件序列符合 04 §3 统一协议（status/chunk/done/error）；stage 字段为可选增量，不破坏协议
- [x] 端点与 04 端点表一一对应，无新增端点
- [x] 确认/编辑/重新生成等 Human-in-the-loop 语义全部由 04 承担，本设计不新增状态
- [x] 匹配度公式满足 PRD §3.3（LLM 分类、程序算分）；01 决定 #3 闭环
- [x] 简历 8 段快照结构不变（02 §6.1），装配分工不影响存储格式
- [ ] agent_runs.feedback 字段缺失（03 §4.1 要求）——待 02 升版（待确认 #4）

## 7. 决定记录

| # | 决定 | 理由 |
|---|---|---|
| 1 | **不做 Supervisor LLM**，编排由 AgentRunner 代码承担 | MVP 每能力由确定性端点触发，LLM 路由无增量价值；PRD §3.3 延伸；V2 自由对话入口再评估 |
| 2 | **匹配度算法两步式**（01 决定 #3 闭环）：LLM 分类 + 程序加权计分 | 分类是认知（同义/相邻判定需理解），算分是确定性（PRD §3.3 禁 LLM 估算） |
| 3 | **模型分档**：reasoner 承担 resume_generate/reflection，其余 chat | 用户确认（2026-09-04）：重任务质量敏感，轻任务可靠性与成本优先 |
| 4 | **结构化输出兜底**：chat 用 json_object；reasoner 用围栏 JSON + 提取 + Pydantic 校验，失败降级 chat 重试 1 次 | reasoner 不支持 json_object；数据库永不写入未校验的 LLM 输出 |
| 5 | Prompt 正文中文、JSON 字段名英文（与 02 §6 一致） | 任务域是中文简历/JD；字段名与 DB 同源零映射 |
| 6 | 文本型任务 chunk 流式；结构型任务非流式 + status 阶段事件 | 流式只服务于"展示文本本身"；两段式（流式+事后结构化）成本 ×2 且兜底已解决可靠性 |
| 7 | 上下文装配由程序确定性查库完成，LLM 不自行检索 | PRD §3.3；输入可审计（agent_runs.input_refs），Prompt 渲染可复现 |
| 8 | 所有数值评分（overall_score / match_score / 计数）程序计算，LLM 只输出分类 | PRD §3.3「程序负责确定性」的评分落地 |
| 9 | **简历 8 段装配分工**：事实段（基本信息/教育/科研/校园/荣誉/意向）程序拷贝，认知段（项目选取与 bullets/技能排序/自我评价）LLM 生成 | 出错面最小化；联系方式与日期永不经过 LLM；LLM 输出体积显著下降 |
| 10 | reasoner 的 reasoning_content 不下发前端，思考期间发 status 占位 | 思考链无展示价值且拖慢感知；UI 需进度反馈（03 §2.8 禁长 spinner） |

## 8. 待确认问题（请用户审阅）

| # | 问题 | 我的建议 |
|---|---|---|
| 1 | reasoner 是否承担 resume_generate/reflection？若追求纯可靠性可全部 chat（json_object 无兜底风险） | 保持分档（决定 #3 已确认分档；兜底策略已覆盖 reasoner 风险） |
| 2 | reasoner 长思考期间：SSE 只发"正在思考…"占位，还是把 reasoning_content 作为折叠调试信息一并下发？ | 只发占位，思考链不下发（简单、省 token） |
| 3 | jd_match 三态判定是否认可"partial 固定 0.5 不细分"？ | 认可（公式可解释，V2 可加置信度） |
| 4 | 03 §4.1 的 👍/👎 需 agent_runs.feedback 字段，02 §4.19 没有 → 需要 02 升版补列（TEXT NULL） | 补列（MVP 前端已有按钮，落库才闭环） |
| 5 | polish_self_eval 空 self_evaluation 时是否允许引导式产出草稿（基于其他资产字段）？ | 允许（属于表达而非编造事实，符合 F1.8"可调用、可重写"） |
| 6 | §4.4 装配分工是否认可——事实段不经 LLM？ | 认可（这是 PRD §3.3 的核心落地，大幅降低编造面） |
