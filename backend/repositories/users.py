'''
单用户模式的默认用户（02 决策 #14 / 04 §1）：

- 无登录，固定默认用户一行；所有资源路由不出现 user_id，
  由各 repository 在这里取默认用户做归属（04 §1「固定默认用户从上下文注入」的落点）
- 多用户演进时：这层换成按鉴权上下文取 user，改一个函数即可
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import User

DEFAULT_USER_EMAIL = "default@ai-job.local"


def get_or_create_default_user(db: Session) -> User:
    """取唯一的默认用户，不存在（首次启动）则创建。"""
    user = db.scalars(select(User).limit(1)).first()
    if user is None:
        user = User(email=DEFAULT_USER_EMAIL)
        db.add(user)
        db.flush()  # 拿到 DB 生成的 id，供外键使用
    return user