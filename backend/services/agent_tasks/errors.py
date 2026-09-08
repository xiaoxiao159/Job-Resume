'''
服务层通用异常（07 §5.3 失败路径）：

- 任务协程内不抛 HTTP 异常（AppError 是路由层职责），
  服务层异常由 manager 翻译为 SSE error 事件 + agent_runs 落库
- TaskCancelled：用户取消 / watchdog 超时（reason 区分错误码）
- TaskInputError：输入级错误（资源不存在 / 上下文超预算），带机器可读 code
- LLMFailure：上游失败 / 结构化解析最终失败（05 §2.3 兜底也失败）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent))


class TaskCancelled(Exception):
    '''cancelled / timeout：reason 为 "user_cancelled" 或 "task_timeout"'''
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class TaskInputError(Exception):
    '''输入级错误（资源不存在 / input_too_large），code 见 04 §6 + 07 §13 #6'''
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class LLMFailure(Exception):
    '''LLM 上游失败或解析最终失败，code 为 "llm_error"'''
    def __init__(self, message: str):
        super().__init__(message)
        self.code = "llm_error"


class ClientCancelled(Exception):
    '''llm_client 内部协作式中断标记（取消旗标命中）；由 manager 转译成带正确 reason 的 TaskCancelled'''