'''
列表响应助手（04 §2.3 offset 分页 / §2.2 列表封装）：

data_list() 按契约拼 DataList 三件套（data + meta + links），
response_model=DataList[X] 在出口强校验每一行 DTO。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

import math
from typing import Any, List, Optional

from fastapi import Query, Request
from pydantic import BaseModel

from backend.schemas.common import Links, Meta


class PageParams(BaseModel):
    '''GET 列表统一分页参数（04 §2.3：默认 20，max 100）'''
    page: int = Query(1, ge=1, description="页码，从 1 起")
    per_page: int = Query(20, ge=1, le=100, description="每页条数")


def data_list(request: Request, rows: List[Any], total: int, page: int, per_page: int) -> dict:
    '''组装列表响应 dict（meta.total/total_pages + links.self/next 按 04 §2.2）'''
    total_pages = max(1, math.ceil(total / per_page)) if total else 0
    self_url = str(request.url.include_query_params(page=page, per_page=per_page))
    next_url: Optional[str] = None
    if page * per_page < total:
        next_url = str(request.url.include_query_params(page=page + 1, per_page=per_page))
    return {
        "data": rows,
        "meta": Meta(total=total, page=page, per_page=per_page, total_pages=total_pages),
        "links": Links(self_url=self_url, next_url=next_url),
    }