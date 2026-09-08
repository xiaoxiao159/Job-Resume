'''
agent_runs 数据访问（04 §3.3 / 02 §4.19）：任务日志只增不改（无 updated_at 列）

- 筛选语义（07 §15 契约差异 #3）：前端 agent_type 参数取值可能是 02 的
  agent_type（如 asset_assist）也可能是 prompt_name（如 jd_analyze），
  列表查询做 prompt_name OR agent_type 双向匹配
- error 列存 JSON 字符串（{code, message[, note]}），由服务端写入、DTO 解析
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.database.models import AgentRun, AgentRunStatus, User
from backend.repositories.users import get_or_create_default_user


def create(db: Session, *, agent_type: str, prompt_name: str, input_refs: dict) -> AgentRun:
    '''触发路由创建任务行（status 默认 running）；flush 取回 DB 生成的 id'''
    user: User = get_or_create_default_user(db)
    run = AgentRun(user_id=user.id, agent_type=agent_type, prompt_name=prompt_name, input_refs=input_refs)
    db.add(run)
    db.flush()
    db.refresh(run)
    return run


def get(db: Session, run_id: str) -> Optional[AgentRun]:
    return db.get(AgentRun, run_id)


def list_runs(db: Session, *, page: int, per_page: int,
              agent_type: Optional[str] = None,
              status: Optional[AgentRunStatus] = None) -> tuple[list[AgentRun], int]:
    '''分页列表；agent_type 参数双向匹配（见模块 docstring）'''
    stmt = select(AgentRun)
    count_stmt = select(func.count()).select_from(AgentRun)
    if agent_type:
        cond = or_(AgentRun.prompt_name == agent_type, AgentRun.agent_type == agent_type)
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if status is not None:
        stmt = stmt.where(AgentRun.status == status)
        count_stmt = count_stmt.where(AgentRun.status == status)
    total = db.scalar(count_stmt) or 0
    rows = list(db.scalars(
        stmt.order_by(AgentRun.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    ))
    return rows, total


def finish(db: Session, run_id: str, *, status: AgentRunStatus, model: Optional[str] = None,
           output_refs: Optional[dict] = None, error_json: Optional[str] = None,
           input_tokens: Optional[int] = None, output_tokens: Optional[int] = None,
           latency_ms: Optional[int] = None) -> None:
    '''任务收尾（成功/失败共用）：状态 + 观测字段；只增不改中的「本轮写入」'''
    run = db.get(AgentRun, run_id)
    if run is None:
        return
    run.status = status
    run.finished_at = func.now()   # SQL 表达式赋值：与 created_at 同源（DB 时钟）
    if model is not None:
        run.model = model
    if output_refs is not None:
        run.output_refs = output_refs
    if error_json is not None:
        run.error = error_json
    if input_tokens is not None:
        run.input_tokens = input_tokens
    if output_tokens is not None:
        run.output_tokens = output_tokens
    if latency_ms is not None:
        run.latency_ms = latency_ms


def set_feedback(db: Session, run_id: str, feedback: str) -> Optional[AgentRun]:
    '''👍/👎 反馈（03 §4.1 / 04 §3.3）：重复提交 = 覆盖（以最新为准）'''
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    run.feedback = feedback
    db.flush()
    return run