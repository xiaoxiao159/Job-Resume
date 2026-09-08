'''
通用 envelope 与跨模块 DTO（依据 04-api-design v0.2 §2.2 / §3.1）

- 单资源成功   {"data": {...}}
- 列表成功     {"data": [...], "meta": {...}, "links": {...}}
- 202 任务受理 {"data": {"agent_run_id": ..., "status": "running"}}
- 统一错误     {"error": {"code", "message", "details"}} —— 由异常处理器产生，DTO 在此定义
'''
from typing import Generic, List, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class Data(BaseModel, Generic[T]):
    """单资源响应包裹（04 §2.2）"""
    data: T = Field(..., description="资源本体")


class Meta(BaseModel):
    """列表分页元信息（04 §2.3，offset 分页）"""
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页，从 1 起")
    per_page: int = Field(..., description="每页条数")
    total_pages: int = Field(..., description="总页数")


class Links(BaseModel):
    """列表分页导航链接，序列化时 key 为 self / next（04 §2.2）"""
    # serialize_by_alias=True：任何路径（FastAPI 响应 / model_dump / 测试）都输出契约 key
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    self_url: str = Field(..., alias="self", description="当前页 URL")
    next_url: Optional[str] = Field(None, alias="next", description="下一页 URL，末页为空")


class DataList(BaseModel, Generic[T]):
    """列表响应包裹（04 §2.2）"""
    data: List[T] = Field(..., description="资源列表")
    meta: Meta = Field(..., description="分页元信息")
    links: Links = Field(..., description="分页导航")


class StartAgentTaskData(BaseModel):
    """Agent 任务受理结果（04 §3.1）：POST 触发 LLM 任务的统一 202 响应体"""
    agent_run_id: str = Field(..., description="任务 ID，前端经 /agent-runs/{id}/events 订阅 SSE")
    status: Literal["running"] = "running"


class ReorderRequest(BaseModel):
    """批量排序请求（04 决策 #7，reorder 端点通用）"""
    ids: List[str] = Field(..., min_length=1, description="按新顺序排列的资源 id 列表，须包含该资源全部 id")


class ErrorDetail(BaseModel):
    """422 字段级错误明细（04 §2.2）"""
    field: str = Field(..., description="出错字段")
    message: str = Field(..., description="错误描述")
    code: str = Field(..., description="错误码，如 missing / string_type")


class ErrorBody(BaseModel):
    code: str = Field(..., description="机器可读错误码，见 04 §6")
    message: str = Field(..., description="人类可读消息")
    details: Optional[List[ErrorDetail]] = Field(None, description="字段级明细，仅 422 有")


class ErrorEnvelope(BaseModel):
    """统一错误响应（04 §2.2 + §6 错误码表）"""
    error: ErrorBody