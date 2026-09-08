# AI Job Copilot · 前端

求职辅助平台前端。严格按 `design/` 下已确认设计文档实现（02 数据模型 / 03 UI-UX / 04 API 契约 / 05 Agent 协议 / 06 前端蓝图），**内置 Mock 层可脱离后端独立运行**，所有 API 调用与 04-api-design.md 端点一一对应、零字段映射（snake_case）。

## 技术栈

React 18 + Vite 5 + TypeScript(strict) + Tailwind CSS v4（CSS-first @theme 令牌）+ TanStack Query 5 + React Router 6 + react-markdown 9 / remark-gfm + Radix primitives（dialog/select/dropdown-menu/tabs/tooltip）+ lucide-react + @fontsource 自托管字体。无全局状态库。

## 运行方式

> 项目约定使用 conda 环境 `ai-job-copilot`（conda-forge nodejs），请勿使用本机 node。

```bash
# Mock 模式（默认，无需后端，数据存内存 + localStorage）
conda run -n ai-job-copilot npm --prefix "D:/AI/Job_Resume/frontend" run dev

# 真实后端：新建 .env（VITE_USE_MOCK=false + VITE_API_BASE_URL=/api/v1），
# 然后 npm run dev 并配置 Vite 代理到 FastAPI（见 vite.config.ts 预留注释）
```

- 构建：`npm run build`（= `tsc --noEmit && vite build`）
- 环境变量：`VITE_USE_MOCK`（默认 true）、`VITE_API_BASE_URL`（默认 /api/v1）
- 说明：若 `conda run` 报 GBK UnicodeDecodeError，用 `PYTHONUTF8=1 conda run ...` 重跑

## 目录结构

```
src/
├── api/               # 与 04-api-design 域文件一一对应，每个函数 withMock(mock, real) 双实现
│   ├── client.ts      # fetch 封装：envelope {data}/{data,meta,links}、统一 error、422→fieldErrors
│   ├── sse.ts         # SSE 订阅（04 §3.2 幂等回放），Mock 走定时器仿真
│   ├── types.ts       # 02 全量实体/枚举（零映射，直接对后端 snake_case）
│   ├── mock/          # db(seed/内存+localStorage) · tasks(流式脚本仿真) · handlers(端点仿真实)
│   ├── *.ts           # dashboard/basic-info/assets/projects/jd/resumes/hr-messages/
│   │                  # applications/interview-qa/agent-runs 十个域文件
├── hooks/useAgentTask.ts   # Agent 统一任务协议状态机（POST 202 → SSE status/chunk*/done）
├── components/
│   ├── ui/            # 03 §8 基础清单：button/input/select/table/tabs/modal/accordion/toast...
│   ├── business/      # StreamText/AIConfirmCard/ReflectionPanel/MDPreview/SectionAccordion/
│   │                  # AssistQuestionnaire/AssistChatDrawer/RefillDiff/TemplatePicker 等 14 件
│   └── layout/        # AppShell（可折叠侧栏）+ nav-config
├── pages/             # 16 个路由页面（dashboard/assets×2/projects×2/jd×3/resumes×2/studio/hr×2/applications/interviews）
├── lib/               # enums 枚举表 / cn / download / resume-render（Markdown+HTML 三种模板、azi-loc 锚）
└── styles/index.css   # 03 设计令牌：Flat Design（primary #0369A1 等）+ .prose-azi 全局样式
```

## 关键机制

- **Agent 任务流**（04 §3 / 05 §6）：`useAgentTask.run(trigger)` → POST 202 `PollTask{agent_run_id}` → SSE `status→chunk*→done{refs}/error`，done 后经 refs 拉取实体并刷新 query；支持取消、terminal 阶段事件守卫、卸载自动退订。
- **人机协作**：AI 产物一律 AI 草稿徽标 + 确认/编辑/重新生成 + 👍/👎（`sendAgentRunFeedback` 为预留端点，待 02 升版 feedback 列后启用）；简历生成问卷（05 §4.6）、素材回填 diff（05 §4.7）、项目表达多轮对话（无会话表，全量历史随轮发送，04 决定 #4）。
- **简历版本状态机**：pending 可编辑 → confirm 锁定（409 locked_version）；reflection 产出 匹配度/覆盖/事实核查 issue。
- **azi-loc 定位锚**（06 §10.1）：`buildResumeMarkdown` 输出 `<!--azi-loc:projects[i].bullets[j]-->`；MDPreview 用 remark 插件在 mdast 层把注释换成哨兵文本（react-markdown 默认管道会丢弃 raw html 节点，已实测）、rehype 插件再替换为 `span[data-azi-loc]`；ReflectionPanel 点击 → `scrollToAziLoc` 滚动+高亮（尊重 prefers-reduced-motion）。
- **Mock 切换**：`withMock(mock, real)` 逐函数分发，改 `.env` 或 `USE_MOCK` 一行即可整体切到真实后端；mock 流式脚本可回放/取消，与真实 SSE 事件协议一致。

## 设计文档索引

`../design/`：01 功能 · 02 数据模型 · 03 UI-UX · 04 API · 05 Agent · 06 前端蓝图（本目录即 06 的落地实现）。