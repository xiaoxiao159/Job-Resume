'''
统一错误通道（04 §2.2 / §6）：

- AppError：业务错误 → HTTP 异常，自带机器可读 code（not_found / skill_name_exists…）
- main.py 注册两个异常处理器：AppError / RequestValidationError 都输出 ErrorEnvelope
- 分工约定：repository 不产生 HTTP 错误（返回 None / 抛 ValueError），
  由路由把「取不到 / 冲突」翻译成 AppError——HTTP 认知只存在路由层
'''
from typing import List, Optional

from fastapi import HTTPException


class AppError(HTTPException):
    """业务错误，code 取值见 04 §6 错误码表；details 仅 422 跨字段校验带（04 §2.2）"""

    def __init__(self, status_code: int, code: str, message: str,
                 details: Optional[List[dict]] = None):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.details = details