'''
Agent 任务管理器（07 §5.1/§5.3/§5.6）：任务生命周期 + 执行管线

- 任务 = asyncio 协程（用户确认：至少 3 个任务并发推进，信号量 AGENT_MAX_CONCURRENCY）
- 路由（sync def，线程池）经 submit() 把协程投递到事件循环：
  run_coroutine_threadsafe；SSE 生成器在同一个 loop 上从 RunBuffer 消费，零跨线程竞争
- DB 阶段全部走 asyncio.to_thread(run_with_session, …)（context.py），
  每个阶段独立 Session/事务：① 装配读、⑤ 落库写、⑥ 收尾写
- 取消/超时：协作式中断（LLM 流式逐 chunk 检查 + 阶段 checkpoint）+ watchdog 兜底；
  失败路径统一 _fail()：error 事件 + agent_runs 落库（error 存 JSON {code, message}）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent))

import asyncio
import json
import logging
from typing import Any, AsyncIterator, Optional

from sqlalchemy.orm import Session

from backend.infrastructure.config import settings, task_llm_config
from backend.repositories import agent_runs as agent_runs_repo
from backend.services.agent_tasks.context import run_with_session
from backend.services.agent_tasks.errors import ClientCancelled, LLMFailure, TaskCancelled, TaskInputError
from backend.services.agent_tasks.events import TERMINAL_EVENTS, AgentEvent, EventHub
from backend.services.agent_tasks.llm_client import Completion, LLMClient
from backend.services.agent_tasks.prompting import estimate_tokens, render_messages
from backend.services.agent_tasks.registry import TaskDef, get_task

logger = logging.getLogger("agent_tasks.manager")


class AgentTaskManager:
    '''进程内单例：事件循环绑定在 lifespan 启动时完成（main.py）'''

    def __init__(self) -> None:
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._semaphore: Optional[asyncio.Semaphore] = None
        self._llm: Optional[LLMClient] = None
        self._hub = EventHub()
        self._running: dict[str, str] = {}          # conflict_key -> run_id（资源级互斥）
        self._cancelled: dict[str, asyncio.Event] = {}   # run_id -> 取消旗标
        self._cancel_reasons: dict[str, str] = {}   # run_id -> user_cancelled | task_timeout
        self._last_event: dict[str, float] = {}     # run_id -> 最近事件时刻（watchdog 用）
        self._watchdog_task: Optional[asyncio.Task] = None
        self._purge_task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # 生命周期
    # ------------------------------------------------------------------

    def start(self) -> None:
        """lifespan 启动时调用：绑定事件循环 + 起 watchdog/清理循环"""
        self._loop = asyncio.get_running_loop()
        self._semaphore = asyncio.Semaphore(settings.AGENT_MAX_CONCURRENCY)
        self._llm = LLMClient()
        self._watchdog_task = asyncio.create_task(self._watchdog_loop(), name="agent-task-watchdog")
        self._purge_task = asyncio.create_task(self._purge_loop(), name="agent-event-purge")
        logger.info(
            "AgentTaskManager 启动：max_concurrency=%d task_timeout=%ss",
            settings.AGENT_MAX_CONCURRENCY, settings.AGENT_TASK_TIMEOUT,
        )

    async def shutdown(self) -> None:
        for task in (self._watchdog_task, self._purge_task):
            if task is not None:
                task.cancel()

    @property
    def started(self) -> bool:
        return self._loop is not None

    # ------------------------------------------------------------------
    # 对外接口（路由调用）
    # ------------------------------------------------------------------

    def is_reserved(self, conflict_key: str) -> bool:
        """资源级互斥快速预检（路由 409 task_running 用）；竞态兜底在 _run 内"""
        return conflict_key in self._running

    def submit(self, run_id: str, prompt_name: str, params: dict, input_refs: dict) -> None:
        """把任务协程投递到事件循环（从路由线程调用，线程安全）"""
        if self._loop is None:
            raise RuntimeError("AgentTaskManager 未启动（lifespan start 阶段初始化）")
        asyncio.run_coroutine_threadsafe(self._run(run_id, prompt_name, params, input_refs), self._loop)

    def cancel(self, run_id: str) -> None:
        """用户取消：置 reason + 通过 loop 置旗标（跨线程安全）"""
        if self._loop is None:
            return
        self._cancel_reasons[run_id] = "user_cancelled"
        self._loop.call_soon_threadsafe(self._set_cancel_flag, run_id)

    def subscribe(self, run_id: str) -> AsyncIterator[str]:
        """SSE 生成器：先重放缓冲（幂等回放）再实时续传；终态事件后结束"""
        return self._stream_generator(run_id)

    # ------------------------------------------------------------------
    # 内部实现
    # ------------------------------------------------------------------

    def _set_cancel_flag(self, run_id: str) -> None:
        event = self._cancelled.get(run_id)
        if event is not None:
            event.set()

    def _touch(self, run_id: str, event: AgentEvent) -> None:
        """事件入缓冲并投递订阅者，同时刷新 watchdog 心跳"""
        self._last_event[run_id] = self._loop.time()
        self._hub.get(run_id).append(event)

    async def _stream_generator(self, run_id: str) -> AsyncIterator[str]:
        buffer = self._hub.get(run_id)
        queue = buffer.subscribe()
        try:
            for event in buffer.snapshot():      # ① 重放（04 §3.2 断线重连幂等）
                yield event.to_sse()
            while True:
                event = await queue.get()        # ② 实时
                yield event.to_sse()
                if event.type in TERMINAL_EVENTS:
                    break
        finally:
            buffer.unsubscribe(queue)

    async def _watchdog_loop(self) -> None:
        """120s 无新事件 → 置 task_timeout 旗标（_run 在下一个 checkpoint/callback 感知）"""
        while True:
            await asyncio.sleep(5)
            now = self._loop.time()
            for run_id, event in list(self._cancelled.items()):
                if self._cancel_reasons.get(run_id) is None:
                    idle = now - self._last_event.get(run_id, now)
                    if idle > settings.AGENT_TASK_TIMEOUT:
                        self._cancel_reasons[run_id] = "task_timeout"
                        event.set()
                        logger.warning("watchdog 触发 task_timeout run=%s idle=%.0fs", run_id, idle)

    async def _purge_loop(self) -> None:
        """事件缓冲 24h 清理（04 确认记录 #3）"""
        while True:
            await asyncio.sleep(600)
            purged = self._hub.purge()
            if purged:
                logger.info("事件缓冲清理 %d 条（完成超 24h）", purged)

    # ------------------------------------------------------------------
    # 执行管线（07 §5.3）
    # ------------------------------------------------------------------

    async def _run(self, run_id: str, prompt_name: str, params: dict, input_refs: dict) -> None:
        task_def: TaskDef = get_task(prompt_name)
        conflict_key = task_def.conflict_key(params) if task_def.conflict_key else None
        started = self._loop.time()

        if conflict_key is not None and conflict_key in self._running:
            # 路由已预检 409，此处是竞态兜底
            await self._fail(run_id, task_def, params, "task_running", "同一资源已有进行中的任务", started)
            return
        if conflict_key is not None:
            self._running[conflict_key] = run_id

        cancel_event = asyncio.Event()
        self._cancelled[run_id] = cancel_event
        acquired = False
        try:
            logger.info("任务开始 run=%s prompt=%s input_refs=%s", run_id, prompt_name, input_refs)
            self._touch(run_id, AgentEvent("status", {"status": "running"}))

            # 并发闸门：超限任务排队（用户要求 ≥3 并发，信号量保证既有并发也防打爆）
            if self._semaphore.locked():
                self._touch(run_id, AgentEvent("status", {"status": "running", "stage": "排队中…"}))
            await self._semaphore.acquire()
            acquired = True
            await self._checkpoint(run_id)

            # ① 装配上下文（DB 阶段 1：读）
            context_data = await asyncio.to_thread(run_with_session, task_def.assemble, params)
            await self._checkpoint(run_id)

            # Master 版等纯程序任务（05 §4.4 资产直取）：跳过 ②③④ 直达落库
            if task_def.skip_llm is not None and task_def.skip_llm(params):
                if task_def.stages:
                    for stage in task_def.stages:
                        self._touch(run_id, AgentEvent("status", {"status": "running", "stage": stage}))
                outcome = await asyncio.to_thread(run_with_session, task_def.persist, params, None)
                await self._checkpoint(run_id)
                await self._finish_ok(run_id, outcome, model_used=None, completion=None,
                                      started=started, fallback_note=None)
                return

            # ② 渲染 Prompt + 上下文预算断言（05 §5.2 显式报错，不静默截断）
            cfg = task_llm_config(prompt_name)
            messages = await asyncio.to_thread(render_messages, prompt_name, **context_data)
            prompt_tokens = await asyncio.to_thread(estimate_tokens, "\n".join(m["content"] for m in messages))
            if prompt_tokens > cfg["context_limit"]:
                raise TaskInputError(
                    "input_too_large",
                    f"任务输入约 {prompt_tokens} tokens，超过预算 {cfg['context_limit']}；请精简资产（如项目描述/JD 长度）后重试",
                )

            # ③ 调用 LLM（流式策略 05 §2.2；reasoning 不下发，占位 status）
            streaming = task_def.event_mode == "chunk"
            thinking_emitted = False

            def on_chunk(text: str) -> None:
                self._touch(run_id, AgentEvent("chunk", {"text": text}))

            def on_thinking(_reasoning: str) -> None:
                nonlocal thinking_emitted
                if not thinking_emitted:
                    thinking_emitted = True
                    self._touch(run_id, AgentEvent("status", {"status": "running", "stage": "正在思考…"}))

            if not streaming and task_def.stages:
                for stage in task_def.stages:
                    self._touch(run_id, AgentEvent("status", {"status": "running", "stage": stage}))

            json_mode = cfg["tier"] == "chat" and task_def.parse is not None
            remaining = max(settings.AGENT_TASK_TIMEOUT - (self._loop.time() - started), 1.0)
            async with asyncio.timeout(remaining):
                completion = await self._call_llm(
                    run_id, messages, model=cfg["model"], temperature=cfg["temperature"],
                    max_tokens=cfg["max_tokens"], json_mode=json_mode,
                    on_chunk=on_chunk if streaming else None,
                    on_thinking=on_thinking,
                )
            await self._checkpoint(run_id)
            model_used = cfg["model"]

            # ④ 解析 + 兜底（05 §2.3：结构化产物必须通过 Pydantic 校验才落库）
            parsed: Any = completion.text
            fallback_note: Optional[str] = None
            if task_def.parse is not None and json_mode:
                parsed = await self._parse_structured(task_def, params, completion.text)
            elif task_def.parse is not None:
                # reasoner 档：围栏提取 + 校验；失败降级 chat + json_object 重试 1 次
                try:
                    parsed = await asyncio.to_thread(task_def.parse, params, completion.text)
                except ValueError:
                    fallback_model = settings.LLM_MODEL_CHAT or settings.LLM_MODEL
                    logger.info("结构化解析失败，降级重试 run=%s prompt=%s → %s", run_id, prompt_name, fallback_model)
                    self._touch(run_id, AgentEvent("status", {"status": "running", "stage": "结构化解析失败，降级重试…"}))
                    fallback = await self._call_llm(
                        run_id, messages, model=fallback_model, temperature=0.1,
                        max_tokens=cfg["max_tokens"], json_mode=True, on_chunk=None, on_thinking=on_thinking,
                    )
                    completion = fallback
                    model_used = fallback_model
                    fallback_note = f"fallback: {cfg['model']} → {fallback_model}"
                    try:
                        parsed = await asyncio.to_thread(task_def.parse, params, fallback.text)
                    except ValueError as exc:
                        raise LLMFailure(f"结构化输出解析与降级重试均失败：{exc}") from exc

            # ⑤ 落库（DB 阶段 2：写，一次 commit）+ ⑥ 收尾（07 决定 #5：先落库再发 done）
            #    分两个 run_with_session：落库先于 agent_runs 状态写入，避免一个事务全回滚
            outcome = await asyncio.to_thread(run_with_session, task_def.persist, params, parsed)
            await self._checkpoint(run_id)
            await self._finish_ok(run_id, outcome, model_used, completion, started, fallback_note)

        except TaskCancelled as exc:
            code = "task_timeout" if exc.reason == "task_timeout" else "task_cancelled"
            message = "任务超时（120s 无进展）" if code == "task_timeout" else "任务已取消"
            await self._fail(run_id, task_def, params, code, message, started)
        except TaskInputError as exc:
            await self._fail(run_id, task_def, params, exc.code, str(exc), started)
        except LLMFailure as exc:
            await self._fail(run_id, task_def, params, exc.code, str(exc), started)
        except TimeoutError:
            await self._fail(run_id, task_def, params, "task_timeout", "任务超时（120s 无进展）", started)
        except Exception as exc:
            logger.exception("任务异常 run=%s prompt=%s", run_id, prompt_name)
            await self._fail(run_id, task_def, params, "internal_error", "任务执行异常，请查看服务日志", started)
        finally:
            if acquired:
                self._semaphore.release()
            self._cancelled.pop(run_id, None)
            self._cancel_reasons.pop(run_id, None)
            if conflict_key is not None:
                self._running.pop(conflict_key, None)
            self._hub.mark_finished(run_id)   # 完成时间戳：24h 后缓冲可清理

    async def _finish_ok(self, run_id: str, outcome: dict, model_used: Optional[str],
                         completion: Optional[Completion], started: float,
                         fallback_note: Optional[str]) -> None:
        """成功收尾（LLM 与纯程序路径共用）：落 agent_runs 观测字段 + done 事件（07 决定 #5）"""
        refs = outcome.get("refs") or {}
        result = outcome.get("result")
        latency_ms = int((self._loop.time() - started) * 1000)
        fallback_json = None if fallback_note is None else json.dumps(
            {"code": "ok", "message": None, "note": fallback_note}, ensure_ascii=False,
        )
        await asyncio.to_thread(
            run_with_session, agent_runs_repo.finish, run_id,
            status="completed", model=model_used, output_refs=refs or None,
            error_json=fallback_json,
            input_tokens=completion.usage.input_tokens if completion else None,
            output_tokens=completion.usage.output_tokens if completion else None,
            latency_ms=latency_ms,
        )
        self._touch(run_id, AgentEvent("done", {"status": "completed", "refs": refs, "result": result}))
        logger.info("任务完成 run=%s latency_ms=%d", run_id, latency_ms)

    async def _call_llm(self, run_id: str, messages: list[dict], *, model: str,
                        temperature: Optional[float], max_tokens: Optional[int],
                        json_mode: bool, on_chunk, on_thinking) -> Completion:
        """LLM 调用与取消旗标竞速：取消即时生效（非流式无法协作注入，靠外侧竞速掐断）"""
        cancel_event = self._cancelled[run_id]
        llm_task = asyncio.create_task(self._llm.complete(
            messages, model=model, temperature=temperature, max_tokens=max_tokens,
            json_mode=json_mode,
            cancelled=cancel_event.is_set if on_chunk is not None else None,
            on_chunk=on_chunk, on_thinking=on_thinking,
        ))
        cancel_task = asyncio.create_task(cancel_event.wait())
        done, _pending = await asyncio.wait({llm_task, cancel_task}, return_when=asyncio.FIRST_COMPLETED)
        if cancel_task in done:
            llm_task.cancel()
            raise TaskCancelled(self._cancel_reasons.get(run_id, "user_cancelled"))
        try:
            return llm_task.result()
        except ClientCancelled:
            # 流式循环内命中取消旗标：转译为正确 reason（用户取消 / watchdog 超时）
            raise TaskCancelled(self._cancel_reasons.get(run_id, "user_cancelled")) from None

    async def _parse_structured(self, task_def: TaskDef, params: dict, raw_text: str) -> Any:
        """json_object 产物解析：解析失败同样走提示（json_object 输出几乎必为合法 JSON）"""
        try:
            return await asyncio.to_thread(task_def.parse, params, raw_text)
        except ValueError as exc:
            raise LLMFailure(f"结构化输出校验失败：{exc}") from exc

    async def _checkpoint(self, run_id: str) -> None:
        """阶段间取消检查点：DB 阶段（to_thread）返回后、emit 前调用"""
        event = self._cancelled.get(run_id)
        if event is not None and event.is_set():
            raise TaskCancelled(self._cancel_reasons.get(run_id, "user_cancelled"))

    async def _fail(self, run_id: str, task_def: TaskDef, params: dict,
                    code: str, message: str, started: float) -> None:
        """失败收尾：error 事件 + agent_runs 落库（含 on_failure 钩子，同一事务）"""
        latency_ms = int((self._loop.time() - started) * 1000)
        error_json = json.dumps({"code": code, "message": message}, ensure_ascii=False)

        def finish_and_hook(db: Session) -> None:
            agent_runs_repo.finish(db, run_id, status="failed", error_json=error_json, latency_ms=latency_ms)
            if task_def.on_failure is not None:
                task_def.on_failure(db, params, code, message)

        try:
            await asyncio.to_thread(run_with_session, finish_and_hook)
        except Exception:
            logger.exception("失败收尾落库失败 run=%s", run_id)
        self._touch(run_id, AgentEvent(
            "error", {"status": "failed", "error": {"code": code, "message": message}},
        ))
        logger.info("任务失败 run=%s code=%s", run_id, code)


manager = AgentTaskManager()