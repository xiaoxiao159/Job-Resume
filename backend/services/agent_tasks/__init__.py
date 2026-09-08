'''
Agent 任务框架的服务层入口（07-backend-design §5）

services/agent_tasks/ 是 LLM 调用的唯一接触面：
- manager  任务生命周期（submit/并发信号量/watchdog/取消/缓冲清理）
- events   SSE 事件缓冲与订阅（04 §3.2 复连回放）
- llm_client  OpenAI 兼容异步客户端（05 §5.2）
- prompting  Jinja2 Prompt 渲染（05 §3）
- registry / tasks  任务注册表与 10 个任务实现
'''