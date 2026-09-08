'''
SSE 事件缓冲与订阅（04 §3.2 / 07 §5.7）：

- AgentEvent：status / chunk / done / error 四类，data 与前端 useAgentTask 契约逐字段对齐
- RunBuffer：每 agent_run 一份——历史事件列表（断线重连幂等回放的唯一数据源，
  04 确认记录 #3 保留至任务完成 + 24h）+ 活跃订阅者 asyncio.Queue 集合
- 全部操作发生在事件循环内（任务协程产出、SSE 生成器消费），无跨线程竞争
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent))

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Literal

EventType = Literal["status", "chunk", "done", "error"]
TERMINAL_EVENTS = ("done", "error")


@dataclass(frozen=True)
class AgentEvent:
    '''一条 SSE 事件。data 形状（04 §3.2）：
    status → {"status": "running", "stage": 可选}
    chunk  → {"text": "…"}
    done   → {"status": "completed", "refs": {…}, "result": 可选}
    error  → {"status": "failed", "error": {"code": …, "message": …}}
    '''
    type: EventType
    data: dict[str, Any]

    def to_sse(self) -> str:
        return f"event: {self.type}\ndata: {json.dumps(self.data, ensure_ascii=False)}\n\n"


class RunBuffer:
    '''单任务的缓冲 + 订阅者管理'''

    def __init__(self) -> None:
        self._events: list[AgentEvent] = []
        self._subscribers: set[asyncio.Queue[AgentEvent]] = set()

    def append(self, event: AgentEvent) -> None:
        '''入缓冲（回放数据源）→ 立刻投递给全部活跃订阅者'''
        self._events.append(event)
        for queue in self._subscribers:
            queue.put_nowait(event)

    def subscribe(self) -> asyncio.Queue[AgentEvent]:
        queue: asyncio.Queue[AgentEvent] = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[AgentEvent]) -> None:
        self._subscribers.discard(queue)

    def snapshot(self) -> list[AgentEvent]:
        '''当前历史事件副本（重放用）'''
        return list(self._events)

    @property
    def finished(self) -> bool:
        return bool(self._events) and self._events[-1].type in TERMINAL_EVENTS


class EventHub:
    '''进程内事件缓冲中心；mark_finished 记录完成时刻供 24h 清理'''

    BUFFER_RETENTION = timedelta(hours=24)  # 04 确认记录 #3：任务完成 + 24h

    def __init__(self) -> None:
        self._buffers: dict[str, RunBuffer] = {}
        self._finished_at: dict[str, datetime] = {}

    def get(self, run_id: str) -> RunBuffer:
        return self._buffers.setdefault(run_id, RunBuffer())

    def mark_finished(self, run_id: str) -> None:
        self._finished_at[run_id] = datetime.now()

    def purge(self) -> int:
        '''清理完成超过 24h 的缓冲，返回清理数量（manager 定时调用）'''
        cutoff = datetime.now() - self.BUFFER_RETENTION
        stale = [
            run_id for run_id, ts in self._finished_at.items()
            if ts < cutoff and self._buffers.get(run_id) is not None
        ]
        for run_id in stale:
            self._buffers.pop(run_id, None)
            self._finished_at.pop(run_id, None)
        return len(stale)