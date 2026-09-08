# 08 AI Job Copilot — 简历项目经历（草稿）

> 用途：求职【AI 应用工程师 / Python 开发工程师 / Agent 开发工程师】方向的简历「项目经历」模块
> 素材来源：design/PRD.md v0.4 · design/05-agent-design.md v0.1 · 07-backend-design.md v0.4 · 代码与脚本实测
> 日期：2026-09-08

---

**【AI Job Copilot 求职辅助平台】** | 独立开发（项目负责人） | 2026.09

一句话定位：面向 AI/互联网求职者的 AI 简历与求职辅助平台（个人全栈项目），以求职者"项目+技能"资产库为基础，跑通「资产盘点 → JD 分析 → 岗位匹配打分 → 定制简历生成 → 反编造校验 → HTML/PDF → HR 开场白 → 投递追踪」完整闭环；前端 React 16 个页面、后端 FastAPI 50 个端点。

- **Agent 多任务框架**：我主导设计并实现基于 FastAPI + asyncio 的统一 Agent 执行框架（AgentRunner），10 类 Agent 任务（JD 分析、岗位匹配、简历生成、反编造复核、HR 文案等）复用「上下文装配 → Jinja2 Prompt 渲染 → LLM 调用 → Pydantic 校验 → 落库留痕」同一条管线；大模型按任务认知深度分档——deepseek-reasoner（DeepSeek-V3.2，OpenAI 兼容协议）承担简历生成/复核等重推理任务，deepseek-chat 承担抽取/改写类任务，换模型只改配置不改代码，解决了多 Agent 各自实现造成的代码重复与全任务一刀切选型的成本问题；10 个 Prompt 模板统一管理（Jinja2 + 共享片段、变更随 Git 可追溯），86/86 幂等冒烟测试全过真实 LLM 链路。

- **LLM 可靠性工程**：我实现"LLM 负责认知、程序负责确定性"架构——岗位匹配度、关键词覆盖率等数值由程序加权计算，LLM 只输出语义分类，杜绝 LLM 估算倾向；简历 8 段中的全部事实内容（联系方式、教育、日期、项目名称/周期/技术栈）由程序从资产库装配、不经 LLM，LLM 只产出项目选取排序与措辞，事实字段被 LLM 改写的风险降为 0（架构级保证）；针对 deepseek-reasoner 不支持 JSON Mode 的短板，实现「围栏提取 + Pydantic 校验 + 降级重试」三级兜底，数据库永不写入未校验的 LLM 输出。

- **Reflection 双层反编造校验**：我实现生成后校验闭环——程序层对简历逐条 bullet 做项目存在性、技术栈白名单、数字溯源 3 类硬性校验，100% 确定性拦截"虚构项目/幻觉技术栈/捏造数字"；LLM 层（deepseek-reasoner）复核语义模糊地带，双结果合并驱动「通过/待修改」状态机，让 AI 包装简历时的编造风险在生成链路内被拦截，而不是靠用户人工发现。

- **SSE 流式与断线重连**：我设计统一 SSE 任务协议（status/chunk/done/error 事件模型）：文本型任务（HR 文案、AI 深挖对话）逐字流式输出、结构型任务按阶段推送进度事件，reasoner 思考链不下发前端、以状态占位；实现客户端断线重连后的事件前缀重放 + 续流至完成，7/7 重连专项测试通过，解决了长 LLM 响应下页面卡死与网络抖动丢事件的问题。

- **后端工程与数据层**：我独立完成 FastAPI + SQLAlchemy 2.0 + PostgreSQL 后端：设计 19 张表的求职资产数据模型（含 14 个枚举 CHECK 约束），15 个 Repository 分层，Docker Compose 编排 postgres:13 容器，幂等建表一键重建；实测定位并修复 SQLAlchemy 2.0.52 在 native_enum=False 时静默丢失枚举 CHECK 约束的问题（显式启用 create_constraint），避免枚举列零约束的上线隐患。

---

## 【技术关键词覆盖检查】

**已覆盖**：Python、FastAPI、asyncio、Agent（自研多 Agent 任务框架）、LLM / 大模型（DeepSeek 双档分权）、Docker、PostgreSQL、SSE 流式、Jinja2 Prompt 工程、Pydantic

**缺失（目标岗位 JD 高频）**：LangChain、LangGraph、RAG、向量数据库（Milvus/Chroma）、Embedding、Reranker、Function Calling、MCP、微调、LoRA、多模态

**缺口说明**：本项目没有用这些技术，简历里也不要伪装"用过"。其中 RAG/向量检索一项缺口最大——传神语联、招行卡中心的 AI 工程师 JD 几乎必提。补法见下方补充清单第 4 条。

---

## 【需要我补充的信息】

1. **【待补充：项目周期表述】** 仓库可查的最早记录是 2026.09，简历写"2026.09"只有 1 个月。如果你 8 月就开始了产品构思/调研，可写"2026.08–2026.09"；面试被问"项目做了多久"要有自圆其说的口径。
2. **【待补充：实测性能数据】** 目前所有数字都是工程规模数据（端点/表/测试数），缺"性能型"数据。agent_runs 表本来就设计了 latency_ms / tokens 字段，直接 SQL 汇总即可拿到：单类任务平均延迟、P95、平均 token 成本。有了它，"简历生成端到端 P95 = X s、平均单任务成本 Y tokens"这类硬数据会让子弹明显更有杀伤力，且完全真实可查。
3. **【待补充：GitHub / 演示地址】** 简历附上仓库链接；面试时可现场走一遍全流程 demo（本项目 16 页面联调已零错误，直接可用）。
4. **【待补充：第二个项目】** 强烈建议快速补一个 RAG/向量检索方向的小项目（如"JD 语义检索"：BGE Embedding + Chroma/Milvus + BM25 混合检索 + Reranker 重排），把 RAG/LangChain 关键词缺口补上。方向不用大，一周左右的 mini 项目即可，应聘 AI 应用工程师时它和本项目正好互补。
5. **前端部分未占 bullet**：16 页面（React + TypeScript strict + Tailwind）、3 个简历模板、Playwright 导出 PDF（实测 200 / 91KB 合法文件）、页面级联调 headless 走 16 路由零控制台错误/零 4xx-5xx——这些是真实材料，我按"AI 应用/Python/Agent 岗的权重在后端+LLM"做了取舍。若某家 JD 偏全栈，可把第 5 条 bullet 换掉。

单项目无需排序建议；若你补充第二个项目，本项目对标岗位匹配度最高、建议永远排第一。