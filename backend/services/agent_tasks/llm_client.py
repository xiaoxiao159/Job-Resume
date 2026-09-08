'''
LLM 客户端封装（07 §5.8 / 05 §5.2）：openai SDK 的 AsyncOpenAI

- 单例复用（SDK 内部连接池）；模型/温度/max_tokens 由调用方按 task_llm_config 传入，
  「换模型只改配置不改代码」
- 流式：逐 delta 回调 on_chunk（文本任务 → chunk 事件）；include_usage 取末块 usage
- reasoning_content：DeepSeek 透传非标准字段，经 model_extra 防御性读取（07 §5.8）；
  若实测 SDK 丢弃该字段，本文件内降级 httpx2 手解析 SSE——隔离在此，不影响其余层
- cancelled：用户取消/watchdog 超时的协作式中断检查点（流式循环每 chunk 检查一次；
  非流式请求的取消由 manager 侧 asyncio wait 竞速接管）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent))

import logging
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

import httpx2
from openai import AsyncOpenAI

from backend.infrastructure.config import settings

logger = logging.getLogger("agent_tasks.llm")


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class Completion:
    text: str
    usage: Usage


def _extra_reasoning(obj) -> Optional[str]:
    '''防御性读取非标准字段 reasoning_content（SDK 未建模的额外字段落在 model_extra）'''
    extra = getattr(obj, "model_extra", None) or {}
    reasoning = extra.get("reasoning_content")
    return reasoning if isinstance(reasoning, str) and reasoning else None


class LLMClient:
    def __init__(self) -> None:
        timeout = httpx2.Timeout(settings.LLM_REQUEST_TIMEOUT, connect=15.0)
        self._client = AsyncOpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
            timeout=timeout,
        )

    async def complete(
        self,
        messages: list[dict],
        *,
        model: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        json_mode: bool = False,
        cancelled: Optional[Callable[[], bool]] = None,
        on_chunk: Optional[Callable[[str], None]] = None,
        on_thinking: Optional[Callable[[str], None]] = None,
    ) -> Completion:
        '''一次补全调用。流式与非流式统一签名：
        - json_mode=True 且 chat 档 → response_format json_object（05 §2.3）
        - stream 与否由调用方决定（文本任务流式、结构任务非流式）
        '''
        kwargs: dict = {"model": model, "messages": messages}
        if temperature is not None:
            kwargs["temperature"] = temperature
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        if on_chunk is not None or on_thinking is not None:  # 流式分支
            kwargs["stream"] = True
            kwargs["stream_options"] = {"include_usage": True}
            logger.info("LLM stream start model=%s messages=%d", model, len(messages))
            parts: list[str] = []
            usage = Usage()
            response = await self._client.chat.completions.create(**kwargs)
            async for chunk in response:
                if cancelled is not None and cancelled():
                    # 内部标记：manager 转译为带正确 reason 的 TaskCancelled
                    from backend.services.agent_tasks.errors import ClientCancelled
                    raise ClientCancelled()
                if chunk.usage is not None:  # include_usage 末块
                    usage = Usage(chunk.usage.prompt_tokens or 0, chunk.usage.completion_tokens or 0)
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                reasoning = _extra_reasoning(delta)
                if reasoning is not None and on_thinking is not None:
                    on_thinking(reasoning)
                elif delta.content:
                    parts.append(delta.content)
                    if on_chunk is not None:
                        on_chunk(delta.content)
            logger.info("LLM stream end model=%s chars=%d", model, sum(map(len, parts)))
            return Completion("".join(parts), usage)

        logger.info("LLM complete start model=%s messages=%d json=%s", model, len(messages), json_mode)
        response = await self._client.chat.completions.create(**kwargs)
        message = response.choices[0].message
        reasoning = _extra_reasoning(message)
        if reasoning is not None and on_thinking is not None:
            on_thinking(reasoning)
        usage = Usage()
        if response.usage is not None:
            usage = Usage(response.usage.prompt_tokens or 0, response.usage.completion_tokens or 0)
        logger.info("LLM complete end model=%s chars=%d", model, len(message.content or ""))
        return Completion(message.content or "", usage)