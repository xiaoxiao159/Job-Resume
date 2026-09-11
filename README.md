# AI Job Copilot

> 面向 AI / 互联网求职者的 AI 简历与求职辅助平台。
>
> 以个人项目与技能资产为基础，通过 JD 分析、岗位匹配、简历定制、项目润色和求职沟通生成，帮助用户针对不同岗位快速制作高匹配度的求职材料，并记录实际投递结果。

## 产品闭环

```text
Career Assets 盘点 → Project Agent 求职表达 → JD 分析 → 岗位匹配
  → Resume Agent JD 定制 → Reflection 验证 → HTML / PDF 简历
  → HR Agent 开场白 → Application Log 投递记录
```

核心设计原则：**Evidence First**（事实 + 证据，不编造）、**一份经历多种表达**（改写而非虚构）、**LLM 负责认知、程序负责确定性**、**AI 生成 + 人工确认**。

## 功能特性

| 模块 | 说明 |
|---|---|
| Dashboard | 投递 / 回复 / 面试 / Offer 基础统计 |
| Career Assets | 基本信息（含求职意向）、项目、技能、教育、科研、校园、荣誉、自我评价，AI 辅助盘点填写 |
| Project Agent | 项目润色，产出简历版 Bullet / 面试版 / STAR 版求职场景表达 |
| JD Analysis | 粘贴 JD → AI 解析岗位画像 → 技能 / 项目匹配 + 差距分析 |
| Resume Agent | JD 驱动定制整份简历（选取 / 排序 / 措辞），Reflection 验证匹配度与编造检查 |
| Resume Studio | 内容与模板分离，3 套模板（Classic / Modern / Minimal），Markdown 预览 + 导出 HTML / PDF |
| HR Agent | 根据 JD + 资产生成开场白（Boss直聘 / 微信 / 邮件 / LinkedIn，简短 / 标准 / 技术版） |
| Application Log | 极简投递记录（状态流转、关联简历版本，为 A/B 测试留数据基础） |
| Interview QA | 面试问题与复盘记录，按公司分组 |

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 · Vite 5 · TypeScript(strict) · Tailwind CSS v4 · TanStack Query 5 · React Router 6 · Radix UI · react-markdown |
| 后端 | FastAPI · SQLAlchemy 2.0 · Pydantic v2 · Python 3.12 |
| 数据库 | PostgreSQL 13（Docker Compose） |
| LLM | OpenAI 兼容接口（DeepSeek / SiliconFlow 直连），双档模型（chat / reasoner），Jinja2 模板管理 Prompt |
| Agent 协议 | POST 202 → SSE 流式（status / chunk* / done），统一任务框架（10 个 Agent 任务） |
| 导出 | Playwright 渲染 HTML → PDF（可选：PDF_BROWSER_CHANNEL=msedge 用系统 Edge） |

- 单体应用，单用户无鉴权（GET /health 健康检查）
- 前端自带 Mock 层（`VITE_USE_MOCK=true` 默认），可脱离后端独立运行，一键切换真实 API
- 前后端字段零映射（snake_case，与 04-api-design 契约一一对应）

## 目录结构

```text
job_resume/
├── frontend/          # React + Vite + Tailwind（16 路由页面，内置 Mock 层）
├── backend/           # FastAPI 分层架构
│   ├── api/           #   8 个路由模块（50 端点）+ 统一错误 envelope
│   ├── schemas/       #   Pydantic DTO（Data/DataList/Meta/Links）
│   ├── repositories/  #   数据访问（15 repos，不产生 HTTP）
│   ├── services/      #   Agent 任务框架（manager / task 定义 / rendering）
│   ├── infrastructure/#   config（backend/.env 加载）
│   ├── database/      #   models（19 张表）/ session（lifespan 内 init_db 建表）
│   ├── prompts/       #   Jinja2 Prompt 模板（10 个任务）
│   └── templates/     #   简历 HTML 模板（Classic / Modern / Minimal）
├── design/            # 设计文档（PRD + 01 功能 ~ 08 项目表达）
│   └── PRD.md         #   产品需求文档 v0.4（设计基准，优先阅读）
├── learn/             # 「逆向学习」课程笔记（侦察报告 / 架构 / 业务链路）
├── scripts/           # 自检与冒烟脚本（smoke / wiring / m6 / SSE 重连）
├── postgres/          # 数据库初始化脚本（init/）
└── docker-compose.yml # PostgreSQL 13 容器（job-postgres）
```

## 快速开始

### 环境要求

- Docker（运行 PostgreSQL）
- **conda 环境 `ai-job-copilot`**（项目工具链约定：conda-forge nodejs + python 3.12，请勿使用本机 node / python）
- LLM API Key（任意 OpenAI 兼容服务，如 DeepSeek / SiliconFlow）

### 1. 启动数据库

```bash
docker compose up -d postgres
```

首次启动自动执行 `postgres/init/` 下的建库脚本。

### 2. 配置后端

在 `backend/.env` 配置 LLM 与数据库连接（字段见 `backend/infrastructure/config.py`）：

```ini
# LLM（OpenAI 兼容）
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_MODEL=deepseek-ai/DeepSeek-V3.2
# LLM_MODEL_CHAT / LLM_MODEL_REASONER 可选，分档覆盖

# PostgreSQL（与 docker-compose.yml 一致）
POSTGRES_USER=postgres
POSTGRES_PASSWORD=123456
POSTGRES_DB=job_resume
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# PDF 导出（可选）：空 = playwright 自带 chromium；msedge / chrome = 系统浏览器兜底
PDF_BROWSER_CHANNEL=
```

### 3. 启动后端（端口 8000）

```bash
conda activate ai-job-copilot
pip install -r backend/requirements.txt

# 可选：安装 PDF 导出所需浏览器（不装则导出返回 501，仍可导出 HTML）
playwright install chromium

# 从仓库根启动（lifespan 自动幂等建表）
uvicorn backend.main:app --reload
```

### 4. 启动前端（端口 5173）

```bash
cd frontend
npm install
npm run dev
```

- **Mock 模式（默认）**：`VITE_USE_MOCK=true`，无需后端，数据存内存 + localStorage
- **真实后端模式**：设置 `VITE_USE_MOCK=false`（Vite 代理 `/api` → 8000，同源无需 CORS）
- 构建：`npm run build`（= `tsc --noEmit && vite build`）
- 若 `conda run` 报 GBK 编码错误，加前缀重试：`PYTHONUTF8=1 conda run -n ai-job-copilot npm --prefix frontend run dev`

## 测试与自检

```bash
python scripts/check_wiring.py        # 打印路由 + Agent 任务 + Prompt 清单
python scripts/smoke_m1.py            # M1 回归冒烟（37/37）
python scripts/smoke_full.py          # 全量冒烟（86/86，幂等可重跑）
python scripts/m6_walk.py             # 页面级联调巡检（16 路由，无控制台错误 / API 4xx-5xx）
python scripts/test_sse_reconnect.py  # SSE 断线重连专项（7/7）
```

> 冒烟脚本依赖后端已启动（默认 `http://localhost:8000`）。

## 当前状态

MVP 主线（M1–M6）全部完成 ✔ —— 设计 → 前端 → 后端 → 联调 → SSE 专项 → PDF 导出均已验证通过。

## 设计文档

所有设计产出遵循「设计先行」工作流，保存在 `design/`（编号文档）：

| 文档 | 内容 |
|---|---|
| [PRD.md](design/PRD.md) | 产品需求文档 v0.4（产品闭环与 MVP 范围，**先读这份**） |
| [01-feature-design.md](design/01-feature-design.md) | 功能设计 |
| [02-data-model.md](design/02-data-model.md) | 数据模型（19 张表 / 枚举约定） |
| [03-ui-ux-design.md](design/03-ui-ux-design.md) | UI / UX 设计 |
| [04-api-design.md](design/04-api-design.md) | API 契约（端点 / 错误 / SSE / 分页） |
| [05-agent-design.md](design/05-agent-design.md) | Agent 架构与任务协议 |
| [06-frontend-design.md](design/06-frontend-design.md) | 前端蓝图 |
| [07-backend-design.md](design/07-backend-design.md) | 后端设计 |

## 路线图

- **V2**：Interview Agent · Offer Management · Career Analytics · Resume A/B Testing · 完善 Evidence System
- **V3**：JD URL 自动解析 · GitHub 自动读取 · 项目代码分析 · 邮件 / 日历同步 · AI Mock Interview · 求职策略 Agent
