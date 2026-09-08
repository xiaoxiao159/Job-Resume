'''
基础设施配置（07-backend-design §8，05-agent-design §5.2）

- Settings：pydantic-settings 读 backend/.env；新增字段全部带默认值，旧 .env 不报错
- 模型分档（05 决定 #3）：chat 档默认 deepseek-chat，重任务 reasoner 档
  兼容旧配置：LLM_MODEL（.env 既有字段，本机为 SiliconFlow 直连模型）作为两档兜底
- TASK_BASELINE：05 §3.3 每 prompt_name 参数基线（温度/max_tokens），
  可用 env LLM_OVERRIDES（JSON 字符串，键=prompt_name）整体覆盖
- task_llm_config(prompt_name)：合成「模型+温度+max_tokens」，任务执行时查询
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"  # backend/.env


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    # LLM
    LLM_API_KEY: str
    LLM_BASE_URL: str
    LLM_MODEL: str                            # 旧配置字段，作为两档模型兜底
    LLM_MODEL_CHAT: str | None = None         # 常规档覆盖（jid_analyze/jd_match/…）
    LLM_MODEL_REASONER: str | None = None     # 重任务档覆盖（resume_generate/reflection）
    LLM_OVERRIDES: dict = {}                  # env JSON：{"jd_analyze": {"temperature": 0.2, "max_tokens": 4096}, …}
    LLM_REQUEST_TIMEOUT: float = 110.0        # §5.6 LLM 请求级超时（秒）
    LLM_CONTEXT_LIMIT_CHAT: int = 64000       # §5.8 上下文预算断言（chat 档）
    LLM_CONTEXT_LIMIT_REASONER: int = 64000   # reasoner 档

    # Database
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str
    POSTGRES_PORT: int

    # Agent 任务框架（07 §5.1/§5.6）
    AGENT_MAX_CONCURRENCY: int = 3            # 并发信号量：至少 3 个任务同时推进
    AGENT_TASK_TIMEOUT: float = 120.0         # watchdog 无进展超时（秒）

    # PDF 渲染（07 §7 rendering）：空 = playwright 内置 chromium；
    # "msedge" / "chrome" = 用系统浏览器（未下载 chromium 时的兜底，Win11 自带 Edge）
    PDF_BROWSER_CHANNEL: str = ""


settings = Settings()

# 05 §3.3 参数基线表（prompt_name → 档位/温度/max_tokens）
TASK_BASELINE: dict[str, dict] = {
    "jd_analyze":          {"tier": "chat",     "temperature": 0.1, "max_tokens": 4096},
    "jd_match":            {"tier": "chat",     "temperature": 0.1, "max_tokens": 4096},
    "project_expression":  {"tier": "chat",     "temperature": 0.3, "max_tokens": 4096},
    "resume_generate":     {"tier": "reasoner", "temperature": None, "max_tokens": 8192},
    "reflection":          {"tier": "reasoner", "temperature": None, "max_tokens": 8192},
    "hr_message":          {"tier": "chat",     "temperature": 0.7, "max_tokens": 2048},
    "assist_chat":         {"tier": "chat",     "temperature": 0.7, "max_tokens": 2048},
    "assist_questionnaire":{"tier": "chat",     "temperature": 0.3, "max_tokens": 2048},
    "assist_refill":       {"tier": "chat",     "temperature": 0.1, "max_tokens": 4096},
    "polish_self_eval":    {"tier": "chat",     "temperature": 0.3, "max_tokens": 2048},
}


def task_llm_config(prompt_name: str) -> dict:
    '''合成任务级 LLM 参数：基线表 + env LLM_OVERRIDES + 分档模型（05 §5.2）'''
    base = TASK_BASELINE.get(prompt_name)
    if base is None:
        raise KeyError(f"prompt_name 未在 TASK_BASELINE 注册：{prompt_name}")
    merged = {**base, **settings.LLM_OVERRIDES.get(prompt_name, {})}

    if merged["tier"] == "reasoner":
        default_model = settings.LLM_MODEL_REASONER or settings.LLM_MODEL
    else:
        default_model = settings.LLM_MODEL_CHAT or settings.LLM_MODEL
    merged["model"] = merged.get("model") or default_model

    merged["context_limit"] = (
        settings.LLM_CONTEXT_LIMIT_REASONER if merged["tier"] == "reasoner"
        else settings.LLM_CONTEXT_LIMIT_CHAT
    )
    return merged