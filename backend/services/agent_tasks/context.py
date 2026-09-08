'''
任务协程内的 DB 阶段助手（07 §5.3 / 决定 #6）：

任务跑在事件循环里，同步 SQLAlchemy 访问会阻塞 loop——每个 DB 阶段
用 asyncio.to_thread(run_with_session, fn, ...) 承载一次「开 Session → 执行 → commit」，
既不阻塞事件循环，也复用全部现有同步 repository 签名。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent))

from typing import Callable, TypeVar

from sqlalchemy.orm import Session

from backend.database.session import SessionLocal

T = TypeVar("T")


def run_with_session(fn: Callable[..., T], *args, **kwargs) -> T:
    '''独立同步 Session 执行 fn；成功 commit、异常 rollback 后重抛，finally 关闭。

    > 配合 asyncio.to_thread(run_with_session, fn, ...) 在任务协程中使用。
    > 注意：不要在 Session 存活期间持有 await——Session 生命周期必须完整落在
      一个 to_thread 调用内，这是本条约定存在的全部意义。
    '''
    session: Session = SessionLocal()
    try:
        result = fn(session, *args, **kwargs)
        session.commit()
        return result
    except BaseException:
        session.rollback()
        raise
    finally:
        session.close()