'''
HR Messages 模块 DTO（04 §5.5 / 前端 hr-messages.ts 契约）

轻量文案与简历不同权（04 决定 #6）：生成即保存 + 可 PATCH 编辑，
无独立确认态、无锁定状态机；重新生成 = 再次 POST 留新行。
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.database.models import HrMode, HrScene


class HRMessageGenerate(BaseModel):
    """POST /hr-messages（202）：触发生成；jd_id / resume_version_id 可空"""
    jd_id: Optional[str] = Field(None, description="依据 JD（画像注入），可空")
    resume_version_id: Optional[str] = Field(None, description="引用简历版本（项目/技能段注入），可空")
    scene: HrScene = Field(..., description="场景：boss_zhipin / wechat / email / linkedin")
    mode: HrMode = Field(..., description="版本：short / standard / technical")


class HRMessagePatch(BaseModel):
    """PATCH /hr-messages/{id}：编辑文案"""
    content: str = Field(..., min_length=1, description="文案正文")


class HRMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    jd_id: Optional[str]
    resume_version_id: Optional[str]
    scene: HrScene
    mode: HrMode
    content: str
    created_at: datetime
