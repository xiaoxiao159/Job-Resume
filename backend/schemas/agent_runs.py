'''
agent_runs DTO（04 §3.3 / 02 §4.19 + 前端契约适配，见 07 §15 契约差异记录）

与 DB 列的三处契约适配（前端 types.ts AgentRun 已定稿，后端 DTO 对齐）：
1. tokens：前端为单字段 → 后端 input_tokens + output_tokens 合计
2. error：前端为 {code, message} 对象 → DB 存 JSON 字符串（服务端写入可控），
   读取时解析；{"code": "ok"} 表示「成功但带附注」（如降级重试记录），对外返回 None
3. agent_type：前端联合类型 = prompt_name 取值 + asset_assist →
   展示值规则：assist_* 任务显示 agent_type（asset_assist），其余显示 prompt_name
   （列表筛选端点在 repo 层做 prompt_name OR agent_type 双向匹配）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

import json
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from backend.database.models import AgentRun, AgentRunStatus

# prompt_name 里归属于 asset_assist 展示值的任务
_ASSIST_PROMPTS = ("assist_questionnaire", "assist_chat", "assist_refill")


def _parse_error(raw: Optional[str]) -> Optional[dict]:
    '''DB error 列（JSON 字符串，服务端写入）→ 前端 {code, message} 对象'''
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {"code": "internal_error", "message": raw}
    if data.get("code") == "ok":      # 成功附注（降级记录），对外无错
        return None
    code = data.get("code") or "internal_error"
    message = data.get("message") or str(raw)
    return {"code": code, "message": message}


class AgentRunRead(BaseModel):
    '''Agent 执行日志条目（前端 AgentRun 契约）'''
    model_config = ConfigDict(from_attributes=True)

    id: str
    agent_type: str
    prompt_name: Optional[str]
    model: Optional[str]
    status: AgentRunStatus
    input_refs: Optional[dict]
    output_refs: Optional[dict]
    tokens: Optional[int]
    latency_ms: Optional[int]
    error: Optional[dict] = None
    feedback: Optional[str] = None
    created_at: datetime

    @classmethod
    def from_row(cls, run: AgentRun) -> "AgentRunRead":
        tokens = None
        if run.input_tokens is not None or run.output_tokens is not None:
            tokens = (run.input_tokens or 0) + (run.output_tokens or 0)
        return cls(
            id=run.id,
            agent_type=run.agent_type if run.prompt_name in _ASSIST_PROMPTS else (run.prompt_name or run.agent_type),
            prompt_name=run.prompt_name,
            model=run.model,
            status=run.status,
            input_refs=run.input_refs,
            output_refs=run.output_refs,
            tokens=tokens,
            latency_ms=run.latency_ms,
            error=_parse_error(run.error),
            feedback=run.feedback,   # 02 v0.4 已补列（03 §4.1 👍/👎）
            created_at=run.created_at,
        )