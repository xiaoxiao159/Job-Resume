# 06 前端设计（Frontend Design）

> 项目：AI Job Copilot
> 依据：PRD.md v0.4 · 01-feature-design.md v0.4 · 02-data-model.md v0.3 · 03-ui-ux-design.md v0.2 · 04-api-design.md v0.2 · 05-agent-design.md v0.1
> 版本：v0.1
> 状态：初稿待确认
> 更新：2026-09-04
> 技术前提：React + Vite + Tailwind（自封装组件 + Radix primitives + TanStack Query + React Router + react-markdown，03 §9 已确认）；后端 FastAPI、单用户无鉴权

## 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-09-04 | 初稿：定位与原则、技术选型、目录结构、**接口预留层（核心，与 04 端点一一对应）**、SSE 订阅客户端、Mock 策略、useAgentTask 核心 Hook、P1–P9 实现规划、枚举映射、响应式与可访问性实现约束、构建部署预留、契约补充清单、待确认问题 |

---

## 1. 定位与设计原则

**本文档定位**：03 定义「界面长什么样、怎么交互」，06 定义「前端怎么实现、与后端怎么连」。页面视觉与交互以 03 为准，本文不重复设计；本文的核心产出是 **§4 接口预留层**——后端尚未动工，前端先行，接口契约先行。

| # | 设计原则 | 落实 |
|---|---|---|
| 1 | **接口即契约** | `src/api/` 是 04 端点总览的唯一前端镜像，端点、路径、字段名（snake_case）逐一对应，零转换；后端就绪前由 Mock 适配器整体替换（§4.5），换真后端只改开关不止代码 |
| 2 | **每个 AI 交互一种编程模型** | 所有 LLM 调用走 `useAgentTask()`（04 §3.3）：触发 → 订阅 → 流式 → done 取实体，页面层不各自发明轮子 |
| 3 | **服务端状态归属 TanStack Query** | 增删改后统一 `invalidate`，跨页数据（如表达确认 → 项目列表状态摘要）自动一致 |
| 4 | **本地编辑态不进 Query** | 表单草稿、Studio 8 段编辑、AI 辅助填写对话是页面局部态（useState/useReducer），保存/确认才落服务端（03「预览即时更新、落库才持久」的实现方式） |
| 5 | **确定性零重复** | MD/HTML 渲染、统计、评分、计数全部后端执行（04 决定 #5、PRD §3.3），前端只呈现；维护成本与出错面双降 |
| 6 | **URL 即状态** | 筛选、Tab、选中项写 query params（03 §3.3 深链接），可分享可回退 |
| 7 | **可访问性是组件级约束** | 03 §7 七条逐一映射到组件实现清单（§8），不进"以后补" |
| 8 | **Token 单向来源** | 03 §2 色彩/字体/圆角/阴影 token 单向流入 Tailwind theme；组件代码禁写裸色值、裸字号 |

---

## 2. 技术选型与工程脚手架

### 2.1 版本与语言

| 项 | 选择 | 理由 |
|---|---|---|
| 语言 | **TypeScript**（待确认 Q1） | JSON 契约量大（简历 8 段、5 类 JSONB）× 流式事件多态（chunk/stage/done/error），类型即文档；snake_case 直传更要求类型来防拼写错 |
| React | 18.x + Vite | 03 §9 已确认；Vite dev proxy 联通 FastAPI 零 CORS 配置（§9） |
| Tailwind | **v4**（待确认 Q2） | CSS-first `@theme` 与 03 §2 CSS 变量天然同构；自封装组件库无 legacy 插件依赖 |
| 状态库 | **不引入全局状态库**（待确认 Q4） | 单用户工作台：服务端态 = Query 缓存，页面局部态 = hooks；无跨页共享客户端态场景（Zustand/Redux 的用武之地不存在）；将来出现再加，成本低 |

### 2.2 依赖清单

```text
运行时：
  react / react-dom / react-router-dom
  @tanstack/react-query
  @radix-ui/react-dialog            # Modal / Drawer / ConfirmDialog
  @radix-ui/react-select            # 表单/表格行内状态下拉
  @radix-ui/react-dropdown-menu     # 行操作"⋯"
  @radix-ui/react-tabs              # 表达类型/经历 Tab
  @radix-ui/react-tooltip           # 图标按钮提示
  lucide-react                      # 图标（03 §2.7）
  react-markdown + remark-gfm       # MD 预览/流式文本
  react-markdown 的 rehype 微插件    # Reflection 定位锚点（§10.1）
  clsx + tailwind-merge             # cn() 工具
  @fontsource/poppins + @fontsource/open-sans   # 英文字体自托管（国内网络不依赖 Google Fonts CDN）

开发：typescript / vite / @vitejs/plugin-react / tailwindcss / postcss / vitest（待确认 Q5）
```

- **Radix 只取复杂交互**（03 §9 决定 #1）：Dialog / Select / DropdownMenu / Tabs / Tooltip 五项；Checkbox / Accordion / RadioCards 等自封装（结构简单，Radix 反增复杂度）
- **不引入**：图表库（Dashboard 为统计卡，03 §5 P1 无图表）、拖拽库（排序用上移/下移按钮，03 §5 P2.2）、Toast 三方库（03 §8 清单含自研 Toast）、日期库（唯一日期输入是投递时间，用原生 `<input type="date">`，日期即字符串 `YYYY-MM-DD`，零时区风险）

### 2.3 设计系统落地（03 §2 → Tailwind theme）

- `@theme` 内联 03 §2.2 全部色 token（`--color-primary: #0369A1` 等 18 枚）→ 组件用语义类 `bg-primary-soft text-primary`，禁裸色值；语义色三态表单一来源在 `lib/enums.ts`（§7）
- 字体：`font-display`（Poppins）/ `font-body`（Open Sans）均由 @fontsource 打包自托管，中文回退系统字体栈（03 §9 决定 #7）
- 圆角/阴影/动效时长按 03 §2.6/§2.8 落 `@theme` 与全局样式（浮层阴影 `0 4px 12px rgba(15,23,42,.08)` 仅用于 Modal/Drawer/Dropdown）

---

## 3. 目录结构与分层规则

```text
frontend/
├─ index.html
├─ vite.config.ts              # dev proxy：/api → http://localhost:8000（§9）
├─ .env.development            # VITE_API_BASE_URL=/api/v1 · VITE_USE_MOCK=true
├─ tsconfig.json / package.json
└─ src/
   ├─ main.tsx / App.tsx       # App = QueryProvider + RouterProvider + AppShell
   ├─ router.tsx               # 03 §3.3 路由表唯一落点
   ├─ styles/                  # tokens.css（03 §2 变量 + @theme 映射）/ base.css
   ├─ lib/                     # cn.ts · download.ts（blob 下载）· enums.ts（§7）
   ├─ api/                     # ★ 接口预留层（§4）——与后端交互的唯一入口
   │  ├─ client.ts / errors.ts / types.ts / sse.ts
   │  ├─ dashboard.ts · basic-info.ts · assets.ts · projects.ts · jd.ts
   │  │  resumes.ts · hr-messages.ts · applications.ts · interview-qa.ts · agent-runs.ts
   │  └─ mock/                 # 开发期数据与 SSE 仿真（§4.5，开关切换）
   ├─ hooks/                   # useAgentTask.ts + 各域查询 hooks（§5）
   ├─ components/
   │  ├─ ui/                   # 基础组件：03 §8 基础清单
   │  ├─ business/             # 业务组件：03 §8 业务清单
   │  └─ layout/               # AppShell / Sidebar / Topbar（03 §3.1/§3.2）
   └─ pages/                   # P1–P9，与 03 §5 一一对应
```

**分层规则（编译期不隔离，靠约定 + review 守住）**：

- `pages/` 只组合 `business/` 与 `ui/`，不含业务逻辑；`business/` 组件只通过 `hooks/` + `api/` 取数，不直写 fetch
- 路由组件不出现 API 调用；`router.tsx` 是 03 路由表唯一实现
- 枚举 → 中文 label → icon → 色的映射只在 `lib/enums.ts` 一份（§7）
- 文件命名 kebab-case、组件 PascalCase；域文件名与 04 资源组同名（`projects.ts` ↔ `/projects*`）

---

## 4. 接口预留层（核心设计）

目标：**后端就绪前，前端每个页面都能对着本层契约开发并联调 Mock；后端就绪后，把开关拨到真实后端即可**。本层是 04 端点总览的逐项镜像，任何与后端交互不得绕过本层。

### 4.1 客户端封装（client.ts / errors.ts）

- `baseURL = import.meta.env.VITE_API_BASE_URL`（dev 默认 `/api/v1`，经 Vite proxy 到 FastAPI；生产同源反代，§9）
- 统一 `request<T>(method, path, { body, params, signal })`：
  - 请求/响应 **snake_case 原样直传**（04 §2.1 零映射成本——DB 是 snake_case、后端是 snake_case，前端刻意不做 camelCase 转换，转换层的价值为零、成本为正）
  - 成功解包 envelope：单资源返回 `data`，列表返回 `data + meta + links`（04 §2.2）
  - 失败抛 `ApiError { status, code, message, details[] }`（04 §2.2/§6 错误码表）
- 错误消费两处归一：**422 `details` → 表单字段就地错误**（03 §4.4，`Field` 组件按 `field` 键映射）；**409 业务冲突/其余错误 → Toast**（如 `target_role_exists`、`locked_version`、`template_not_selected`、`task_running` 各有专属文案）
- 每个请求接受 `AbortSignal`，组件卸载即取消；**不自动重试**——幂等 GET 交由 TanStack Query 的 `retry`，写操作重试有副作用风险
- 单用户无鉴权：不预留 token 逻辑；将来多用户时在 `client.ts` 单点注入中间件（04 §1 演进路径）

### 4.2 类型契约（types.ts，同源于 02 §6 / 04 §5）

- 全量镜像 02 §5 枚举为 TS union（`ApplicationStatus = 'to_apply' | 'applied' | …` 等 20 支）
- 全量镜像 02 §6 JSONB 结构（均带 `schema_version`），示例：

```ts
// 02 §6.1 —— 简历 8 段快照
export interface ResumeContent {
  schema_version: number;
  basic_info: { name: string; email: string; phone: string; github: string | null; homepage: string | null };
  job_intention: { role: string; city: string; availability: Availability };
  education: { school: string; major: string; degree: Degree; period: string; courses: string }[];
  research: Array<Record<string, string>>;          // 结构同 experiences 资产行
  campus: Array<Record<string, string>>;
  projects: Array<{
    name: string; period: string; role: string;
    tech_stack: string[]; bullets: string[];
    github: string | null; demo: string | null;
  }>;
  honors: { name: string; time: string }[];
  skills: { name: string; proficiency: Proficiency }[];
  self_evaluation: string;
}
```

- 其余类型按 02 §6.2–§6.5 同规则镜像（`JdAnalysis`、`ProjectExpressionContent` 三态联合、`JdMatch`、`ReflectionResult`），**不扩展、不改名**——前后端类型同源，字段增删只发生在 02 文档
- 列表响应泛型 `ApiList<T> = { data: T[]; meta: Meta; links: Links }`；`AgentRunTaskRef = { agent_run_id: string; status: AgentRunStatus }`（04 §3.1 202 响应）

### 4.3 端点 → 函数全表（与 04 §4 端点总览逐行对应）

每个 API 文件导出一组具名函数，**函数名 = 资源 + 动作**，路径与参数完全取自 04：

| 域文件 | 函数（近似 TS 签名，§5.2 页面映射引用此表） |
|---|---|
| `dashboard.ts` | `getDashboard(): Promise<DashboardData>` |
| `basic-info.ts` | `getBasicInfo()` · `putBasicInfo(body)` · `polishSelfEval(): PollTask`（04 §5.2，202） |
| `assets.ts` | 三张同构表（03 §5 P2.4）：`listEducations()` / `createEducation(body)` / `getEducation(id)` / `patchEducation(id, body)` / `deleteEducation(id)` / `reorderEducations(ids)`；experiences、honors 同构各 6 个；`listSkills()` / `createSkill(body)` / `patchSkill(id, body)` / `deleteSkill(id)` |
| `projects.ts` | `listProjects(params)` / `createProject(body)` / `getProject(id)` / `patchProject(id, body)` / `deleteProject(id)`；`listEvidence(projectId)` / `createEvidence(projectId, body)` / `patchEvidence(id, body)` / `deleteEvidence(id)`；`getProjectSkills(projectId)` / `setProjectSkills(projectId, skill_ids)`；`listExpressions(projectId, type?)` / `generateExpression(projectId, type): PollTask` / `patchExpression(id, body)`（确认/编辑内容）；`assistQuestionnaire(projectId, answers): PollTask` / `assistChat(projectId, messages): PollTask` / `assistRefill(projectId, messages): PollTask`（04 §5.2 两段式，无会话表） |
| `jd.ts` | `listJDs(params)` / `createJD(body)` / `getJD(id)` / `patchJD(id, body)` / `deleteJD(id)`；`analyzeJD(id): PollTask` / `getAnalysis(jdId)` / `listMatches(jdId)` / `runMatch(jdId): PollTask` |
| `resumes.ts` | `listResumes(params)` / `createResume(body)` / `getResume(id)` / `patchResume(id, body)`（改 template/title）/ `deleteResume(id)`；`listVersions(resumeId)` / `generateVersion(resumeId, body): PollTask`；`getVersion(id)` / `patchVersionContent(id, content)`（仅 pending，409 由调用方处理）；`regenerateVersion(id, body): PollTask` / `reflectVersion(id): PollTask` / `confirmVersion(id)`；`previewVersion(id, format: 'md' \| 'html')`（文本响应，非 envelope）/ `exportVersion(id, format: 'html' \| 'pdf')`（文件流 blob） |
| `hr-messages.ts` | `listHRMessages(params)` / `generateHRMessage(body): PollTask` / `getHRMessage(id)` / `patchHRMessage(id, body)` / `deleteHRMessage(id)` |
| `applications.ts` | `listApplications(params)`（status 多值/q/sort）/ `createApplication(body)` / `getApplication(id)` / `patchApplication(id, body)`（状态流转 = PATCH status）/ `deleteApplication(id)` |
| `interview-qa.ts` | `listInterviewQA(params)` / `createInterviewQA(body)` / `patchInterviewQA(id, body)` / `deleteInterviewQA(id)` |
| `agent-runs.ts` | `getAgentRun(id)`（断线重连查状态，§4.4）/ `listAgentRuns(params)` / `pollAgentRunEvents(id)`（内部 SSE 连接器，§4.4）/ `cancelAgentRun(id)` / `**sendAgentRunFeedback(id, feedback)`（预留，见 §10.2） |

`PollTask` = 04 §3 统一协议的触发返回值（`{ agent_run_id, status }`），页面调用后统一交给 `useAgentTask` 消费，**任何模块不得自行处理 202**。

### 4.4 SSE 订阅客户端（sse.ts，04 §3.2 精确实现）

```text
事件协议（04 §3.2 + 05 §6）：
  status  → 阶段事件：running / （05 预留 stage：thinking 等）
  chunk   → 流式文本追加：{ text }
  done    → { status: "completed", refs: {...}, result?: {...} }
  error   → { status: "failed", error: { code: "llm_error", message } }
```

- 原生 `EventSource`（GET `/agent-runs/{id}/events`，无鉴权代价；fastify/FastAPI SSE 均为标准实现）
- **断线重连（幂等回放）**：EventSource 自动重连后不稳定，跨接以「先查后听」兜底——`onerror`/重连前 `GET /agent-runs/{id}` 查状态：`completed` → 跳过订阅，直接按 done.refs 取实体（服务端保留事件缓冲至完成 +24h，重放幂等，04 §3.2）
- **超时看门**：连接 120s 无进展 → 后端子判 failed；前端同步显示超时错误与「重试」（04 §3.2）
- **取消**：`POST /agent-runs/{id}/cancel`，前端立即回到 idle 并显示「已停止，草稿未保存」占位（03 §4.1 停止按钮语义）
- **done 后的动作统一**：`refs` 中的实体 id → Query `invalidate`/定向 `setQueryData` → 页面跳转或就地呈现；`result`（无实体产物，如回填建议 fields）直接交给页面

### 4.5 Mock 适配器（待确认 Q3）

- `client.ts` 入口分流：`VITE_USE_MOCK=true` 时每个 api 函数调用 `mock/` 下的同名实现，**签名、envelope、类型、错误码与真实后端逐一对齐**
- Mock 数据：内存 + localStorage 持久（刷新不丢）；SSE 仿真器用定时器按 03 打字节奏发射 `status → chunk* → done` 序列（含思考占位阶段，§5.1），支持模拟失败注入
- 推荐理由（对比 MSW）：域级分流使 Mock 实现与 api 函数并排书写、类型强制同构，开关单点 `VITE_USE_MOCK`；MSW 网络层拦截更接近真实环境但需平行维护一份 handler 表且触不到类型约束。两者契约一致性风险相同，本方案少一层网络抽象
- 防线：**联调验收时全量走真实后端**，Mock 只服务开发期；后端每个端点完成即可逐域切换开关

---

## 5. 核心 Hook 设计

### 5.1 `useAgentTask`（04 §3.3 的统一流式模型）

```ts
type AgentTaskState =
  | { phase: 'idle' }
  | { phase: 'triggering' }
  | { phase: 'streaming'; chunks: string[]; stage?: string; agent_run_id: string }
  | { phase: 'done'; streamed_text: string; result?: unknown; refs: Record<string, string> }
  | { phase: 'error'; error: ApiError };

const task = useAgentTask();
await task.run(taskRefOrTrigger, { onDone?, onError? });
task.cancel();
```

- 内部编排：`trigger()`（POST 202，拿 agent_run_id）→ `connect()`（sse.ts）→ 事件归约到 state → `done` 时执行 `onDone`（由调用方确定实体取用与 Query 失效）→ 组件卸载自动取消连接（不取消任务，任务在后端继续；回到页面时「先查后听」恢复，§4.4）
- **阶段展示联锁（03 §2.8 + 05 决定 #10）**：`stage === 'thinking'`（reasoner 思考占位，聊天流可能长）→ `StreamText` 显示「正在思考…」脉冲占位，**禁 10s+ spinner**；`chunk` 序列 → 打字机渲染；`reduced-motion` 下改分段展示（03 §7.6）
- `aria-busy` 贯穿触发→完成；完成时 `aria-live="polite"` 一次性播报（03 §7.5）
- 页面禁用态规则：同资源已有运行中任务（04 `task_running` 409）时按钮禁用（如 JD 分析中「重新分析」置灰）

### 5.2 领域 hooks 清单（Query 边界）

| Hook | 数据 | 要点 |
|---|---|---|
| `useDashboard()` | GET /dashboard | 无需失效策略（页面级刷新） |
| `useAsset()` 系列 | basic-info / educations / experiences / honors / skills | 表页 + Modal 表单共用缓存；reorder 后直接 `setQueryData` 免闪 |
| `useProject(id)` / `useProjectList(params)` | projects | 表达确认后 invalidate 项目列表（状态摘要联动，03 §5 P2.2） |
| `useEvidence(projectId)` / `useExpressionList(projectId, type)` | 项目子资源 | 分 key 缓存 |
| `useJDAnalysis(jdId)` / `useJDMatchList(jdId)` | 分析/匹配留档 | 分析 processing 轮询：仅当 status=processing 时 2s 间隔 refetch（04 §5.3 骨架屏） |
| `useResumeVersions(resumeId)` / `useResumeVersion(id)` | 简历版本 | 确认/生成后 invalidate；409 `locked_version` 统一提示 |
| `useStudioDraft(versionId)` | P6 本地编辑态 | 初始化自 `GET version.content`；保存 = PATCH（仅 pending）；脏状态拦截（03 §4.6）；**导出前自动 flush**（03 §5 P6） |
| `useHRMessages(params)` | 开场白历史 | 生成 202 → done.refs → invalidate 列表 |
| `useApplications(params)` | 投递列表 | params（筛选/分页/排序）序列化为 query key；行内改状态乐观更新 + 失败回滚 Toast |
| `useInterviewQA(params)` | 面试 QA | 按公司分组在页面层做（后端返回全量列表，单用户数据量小） |

---

## 6. 页面实现规划（03 §5 P1–P9 → 路由/数据/组件映射）

| 页面 | 路由 | 数据（§4.3 函数） | 关键组件（03 §8） | 实现要点 |
|---|---|---|---|---|
| P1 Dashboard | `/` | `getDashboard` | 统计卡、EmptyState | 主 CTA 粘贴框 `value` 带参直达 `/jd/new?text=`（03 §5 P1）；数据直出后端，前端零计算 |
| P2.1 Basic Info | `/assets/basic` | `getBasicInfo`/`putBasicInfo` | 分组表单、Toast | 单例 PUT（upsert，04 §5.2）；`polishSelfEval` 走 AIConfirmCard 三动作（仅自我评价可 AI）；sticky 保存栏随脏状态出现 |
| P2.2 Projects | `/assets/projects` | `listProjects`/`createProject`/`reorder…` | Card、TagInput、StatusPill | 卡内表达状态摘要；排序 = 上移/下移按钮（03 决定，不做拖拽） |
| **P2.3 Project 详情** | `/assets/projects/:id` | `getProject`/`patchProject` + **assist 三函数** | 折叠卡表单、**AssistQuestionnaire → AssistChatDrawer → RefillDiff** | 两段式核心页：① 问卷 Modal 提交 → PollTask；② 抽屉对话：**前端持 message 数组**（无会话表，04 决定 #4），每轮全量送 `assistChat`，逐段流式渲染；「停止并回填」→ `assistRefill` → done.result.fields → RefillDiff 黄高亮逐字段可改 → 确认后 PATCH 项目（仍为表单草稿，最终随保存落库）；刷新丢历史提示条 |
| P2.4 四资产表页 | `/assets/skills` 等 | 对应表 CRUD + reorder | Table、Modal 表单 | 极简表格 + Modal（03 §5 P2.4）；Experiences Tab = Radix Tabs |
| P3.1 JD 输入 | `/jd/new` | `createJD` | Textarea、EmptyState | `?text=` 预填；提交成功跳 `/jd/:id`（分析中状态页） |
| P3.2 JD 分析结果 | `/jd/:id` | `analyzeJD`→`getAnalysis` · `runMatch`→`listMatches` | StarRating、MatchList、GapPanel、ProgressRing、AIConfirmCard | analysis processing → 骨架屏 + 轮询；done.refs.jd_analysis_id → invalidate；匹配历史时间轴；主 CTA 带 `?jd_id=` 跳简历生成 |
| P3.3 JD 历史 | `/jd` | `listJDs` | Table、ConfirmDialog | 匹配度列取最新留档 |
| P4 Project Copilot | `/project-agent` | `listProjects`+`listExpressions`+`generateExpression`+`patchExpression` | Tabs、AIConfirmCard | 项目选择器带概要；三种表达类型 Tab；版本列表确认置顶/历史折叠灰；**回退 = 以旧版本为基础新建**（05 语义，覆盖确认提示 03 §4.6）；生成后提示「简历组装将优先取用已确认表达」 |
| P5.1 简历列表 | `/resumes` | `listResumes`/`createResume` | 分组列表、EmptyState | 按 target_role 分组；409 `target_role_exists` Toast 专属文案 |
| P5.2 定制流程页 | `/resumes/:id` | `generateVersion`→`getVersion` · `reflectVersion` · `confirmVersion` | MDPreview、**ReflectionPanel**、StreamText | 生成 202 → done.refs → GET 版本（reflection_status=pending）；**Reflection 点击定位**依赖锚点协议（§10.1）；confirm 带 issues 时二次确认（03）；确认后引导进 Studio；重新生成附加意见输入走 `regenerateVersion` |
| P6 Resume Studio | `/resumes/:id/studio` | `useStudioDraft` · `previewVersion` · `exportVersion` · `patchResume`(template) | SectionAccordion（8 段）、TemplatePicker、MDPreview、ResumePreviewFrame | 左 45%/右 55%（03 §5）；**本地 draft ⇄ PATCH 落库**；右预览 = `preview?format=html` 文本灌 iframe（sandbox 隔离，03 §9 决定 #5）+ MD/HTML 双模式（format=md 经 react-markdown）；选模板 → PATCH resume → 重取预览；`template_not_selected` 409 → 提示先选模板；空段灰显「模板将自动隐藏」+ 补资产链接；导出 blob 下载（PDF 按钮 loading，04 决定 #5 后端渲染） |
| P7 HR Assistant | `/hr` `/hr/:id` | `generateHRMessage`/`listHRMessages`/`patchHRMessage` | RadioCards（场景/模式）、AIConfirmCard、复制按钮 | 依据（JD+简历版本）可改选；**复制 = Clipboard API + fallback（textarea execCommand）+ 图标态变化 + Toast**（高频操作，03 §5 P7）；生成即保存（04 决定 #6），编辑 = PATCH |
| P8 Applications | `/applications` | `listApplications`/`createApplication`/`patchApplication`/`deleteApplication` | Table、行内 Select（Radix）、Drawer 表单、ConfirmDialog | 筛选 chips → query params（深链接）；行内状态 Select 修改即存 + 乐观更新；`applied_at` 缺时 422 就地提示（04 §5.6）；删除说明不删关联 Interview QA（03 §5 P8） |
| P9 Interview QA | `/interview` | `listInterviewQA`/`createInterviewQA`/`patchInterviewQA`/`deleteInterviewQA` | Accordion、Modal 表单 | 公司手风琴分组；选已有投递自动带出岗位（04 §5.6）；A 默认 line-clamp-3 + 展开 |

**路由守卫**：无鉴权，不设守卫；唯一引导是 `/` Dashboard 主 CTA。

---

## 7. 枚举映射与文案（lib/enums.ts，单一来源）

- 20 支枚举（02 §5）各配三件套：`{ value, label（中文）, meta }`，meta 含 03 §2.3 的 icon（Lucide）与语义色 token
- `StatusPill` / 筛选 chips / 表格列全部由此表驱动渲染（03 §2.3 规范：**icon + 色 + 文字三重编码**，纯展示不可点、可交互加 hover，03 §4.3）
- `analysis_status` 特殊：processing 渲染 Loader 旋转而非 pill；`reflection_status` 盾徽变体（Clock / ShieldCheck / ShieldAlert）
- 表单选项（availability、evidence_type、hr_scene/mode 等）复用同一表生成，label 无二处手写
- 文本大小写/称呼统一：按钮动词与结果 Toast 同词（「确认」→「已确认」，03 未例举处遵循此自洽规则）

---

## 8. 响应式与可访问性实现约束（03 §6/§7 落到组件）

- 断点映射：`lg:1024 / md:768` 对应 03 §6 三档（侧边栏折叠 64px 图标态、Studio 左栏收窄/单栏 Tab、表格→卡片）；表单页 880px / 宽表页 1200px 容器为 `Shell` 内建约束
- **焦点可见**：`ui/` 组件统一输出 `focus-visible:ring-2 ring-[--color-ring] ring-offset-2`，鼓励组件绝不主动移除 outline；触控目标 ≥40px 为按钮/输入默认高度约束
- **AI 流式无障碍**：`StreamText` 内建 `aria-busy` + 完成一次性 `aria-live`（§5.1）；`Typography `reduced-motion` 用 Tailwind `motion-reduce:` 关打字动画改分段展示
- **Modal/Drawer**：Radix Dialog 自带焦点圈定/Esc/背景滚动锁定；打开聚焦首元素、关闭归还触发元素（03 §7.7）；ConfirmDialog 红色破坏性按钮在右侧
- **表单规范组件化**：`Field` 组件内建可见 label + 必填 `*` + helper text（STAR 提示落位）+ 就地错误（ApiError.details 映射，§4.1）；占位符仅作示例，不作 label（03 §4.4）
- 骨架屏与 `aria-busy` 成对出现（03 §4.2 分级反馈表为组件的时长参数：<200ms 免反馈、200ms–1s 按钮 loading、>1s 骨架）
- 空状态 = 图标 + 一句话 + 主 CTA（03 §4.5 每页定义，`EmptyState` 统一承载）

---

## 9. 构建、环境与部署预留

- **dev**：`vite.config.ts` proxy `/api` → `http://localhost:8000`（FastAPI 默认端口），前端零 CORS、零跨域心智；`.env.development` 两个开关（API base、MOCK）
- **build**：`vite build` → `dist/` 纯静态；产物供 docker/ 阶段 nginx 托管 + `/api` 反代（实现阶段，容器结构与 docker/ 目录对齐预留）
- **SPA 路由**：生产 nginx `try_files $uri /index.html`；dev 由 Vite 兜底
- 字体随包构建（@fontsource 自托管，§2.2），无外部 CDN 依赖——离线可用、国内可达

---

## 10. 契约补充清单（前端设计派生、需后端配合确认）

| # | 项 | 说明与建议 | 归属 |
|---|---|---|---|
| 10.1 | **Reflection 定位锚点协议** | 03 §5 P5.2「点击定位 → 左侧高亮」需要 MD 行与 `location`（如 `projects[0].bullets[1]`）的稳定映射。建议：后端 `preview?format=md` 渲染时在每项目 bullet 行后输出 HTML 注释锚 `<!--azi-loc:projects.0.bullets.1-->`（不可见、不影响渲染）；前端 rehype 微插件提取为 `data-azi-loc` 节点 → 点击滚动 + 高亮。两端规则单一来源在后端渲染器 | 04/05 实现备注 |
| 10.2 | **👍/👎 反馈端点缺失** | 03 §4.1 要求生成结果卡 👍/👎（落 agent_runs）；04 无此端点、02 无 feedback 列（05 §6 已挂账待确认 #4）。前端先预留 `sendAgentRunFeedback()` 与按钮 UI，端点/列落地后启用 | 02/04/05 升版 |
| 10.3 | **SSE stage 事件** | 05 预留 `stage`（thinking 等），前端 §5.1 已按有/无两种情况消费（无则不显示思考占位） | 05 确认 |
| 10.4 | **preview/export 响应为非 envelope** | 文本/文件流不走 `{data}` 封装（04 §5.4 定义），client.ts 已按路径白名单特殊处理 | 已对齐 |

---

## 11. 检查清单（与前序文档一致性）

- [x] 04 §4 端点总览与 §4.3 函数表逐行对应（Dashboard 至 Agent 横切全量覆盖，无遗漏）
- [x] 03 §8 组件清单（22 基础 + 14 业务）全部落入 ui/ 与 business/，无未映射组件
- [x] 03 §7 可访问性七条逐一有实现落点（§8）
- [x] 02 §5 全部枚举有 TS union（§4.2），02 §6 全部 JSONB 有对应类型
- [x] 04 §3 任务协议全消费（202 → SSE → done.refs/result → 实体）；断线重连、取消、超时、409 task_running 均已设计
- [x] 05 协议增量（stage/thinking 占位）按可选消费，不回退 04 协议
- [x] 04 决定 #4（无会话表）由页面态单点实现，不留会话代码路径
- [x] 单用户无鉴权：无 token 逻辑（§4.1），多用户演进单点注入
- [x] 响应式三档与 03 §6 对应；字体自托管满足国内可达

## 12. 待确认问题（请用户审阅）

| # | 问题 | 我的建议 |
|---|---|---|
| Q1 | 是否启用 TypeScript？ | **启用**：JSON 契约量大（8 段/5 类 JSONB）+ SSE 事件多态，类型即接口文档，与后端契约同源零漂移 |
| Q2 | Tailwind v3 还是 v4？ | **v4**：CSS-first `@theme` 与 03 §2 的 CSS 变量体系同构，自建组件库无 v3 插件包袱 |
| Q3 | Mock 策略：内嵌适配器（api 层分流）还是 MSW（网络层拦截）？ | **内嵌适配器**：类型强制同构、开关单点、AI 流式可仿真；MSW 距真实更近但平行维护一份 handler（§4.5） |
| Q4 | 是否引入全局状态库（Zustand 等）？ | **不引入**：单用户工作台，服务端态 = Query 缓存 + 页面局部态已覆盖全部场景；将来有跨页客户端态再加 |
| Q5 | MVP 前端测试范围？ | **最小**：`useAgentTask` 状态机 + `lib/enums` 映射 + client 错误映射单测（Vitest）；页面/组件不测，留给 V2 |
| Q6 | Reflection 定位锚点协议（§10.1）是否认可？ | **认可**：后端 MD 预览输出注释锚 + 前端 rehype 微插件提取，渲染规则单一来源在后端 |

**依赖提醒**：05-agent-design v0.1 尚有 6 问待确认，其中 #4（feedback 字段）影响本文 §10.2 的预留项；其余 05 决策与本文无冲突，两文档可并行确认。
---

## 13. 实现状态（2026-09-04）

用户跳过 §12 单独确认轮（Q1–Q6 均按建议方案落地），直接命令产出 `frontend/` 完整代码。已实现并构建通过：

- Q1 TypeScript（strict）✓ · Q2 Tailwind v4 CSS-first ✓ · Q3 内嵌 withMock 适配器 ✓ · Q4 无全局状态库 ✓ · Q5 测试暂缓（留给后端阶段补 useAgentTask 单测）· Q6 定位锚 ✓
- 16 路由页面 + 14 业务组件 + 10 域 API 文件 + Mock 层（db/seed/tasks/handlers）全部落地，`tsc --noEmit` 0 错误。
- §10.1 锚协议实现有一处实证修正：react-markdown 默认管道丢弃 raw html 注释节点，故改为 remark 插件（mdast 层注释→哨兵文本）+ rehype 插件（哨兵→`span[data-azi-loc]`）两段式，交互协议不变。
- §10.2 feedback 预留已落地（`sendAgentRunFeedback` 走 Mock、真实端点就绪待 02 升版）。
- 运行方式见 `frontend/README.md`（conda env `ai-job-copilot`）。
