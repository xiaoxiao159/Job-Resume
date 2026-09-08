'''hr_message 任务（05 §4.6）：场景化打招呼文案，chunk 流式，生成即落库（draft 可编辑）'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent.parent))

import json

from sqlalchemy.orm import Session

from backend.database.models import JobDescription, ResumeVersion
from backend.services.agent_tasks.errors import TaskInputError
from backend.services.agent_tasks.registry import TaskDef
from backend.repositories import hr_messages as hr_messages_repo

_SCENE_LABELS = {"boss_zhipin": "BOSS 直聘", "wechat": "微信", "email": "邮件", "linkedin": "领英"}
_MODE_LABELS = {"short": "短句版（首条破冰）", "standard": "标准版", "technical": "技术版（项目切入）"}


def _assemble(session: Session, params: dict) -> dict:
    '''① 上下文装配：JD（可选）+ 简历版本内容（可选）+ 场景/版本'''
    jd_block = None
    if params.get("jd_id"):
        jd = session.get(JobDescription, params["jd_id"])
        if jd is None:
            raise TaskInputError("not_found", f"JD {params['jd_id']} 不存在（可能已被删除）")
        jd_block = {"title": jd.title or "", "company": jd.company or "", "raw_text": jd.raw_text}

    content_block = None
    if params.get("resume_version_id"):
        version = session.get(ResumeVersion, params["resume_version_id"])
        if version is None:
            raise TaskInputError("not_found", f"简历版本 {params['resume_version_id']} 不存在")
        content = version.content or {}
        content_block = {
            "name": (content.get("basic_info") or {}).get("name", ""),
            "role": (content.get("job_intention") or {}).get("role", ""),
            "projects": [
                {"name": p.get("name", ""), "tech_stack": p.get("tech_stack", []),
                 "bullets": p.get("bullets", [])}
                for p in (content.get("projects") or [])[:3]
            ],
            "skills": [s.get("name", "") for s in (content.get("skills") or [])][:8],
        }

    return {
        "scene": params["scene"],
        "scene_label": _SCENE_LABELS[params["scene"]],
        "mode": params["mode"],
        "mode_label": _MODE_LABELS[params["mode"]],
        "jd_json": json.dumps(jd_block, ensure_ascii=False),
        "content_json": json.dumps(content_block, ensure_ascii=False),
    }


def _persist(session: Session, params: dict, text: str) -> dict:
    '''⑤ 落库：生成即保存（无锁定状态机，04 §5.5）'''
    message = hr_messages_repo.create(
        session,
        jd_id=params.get("jd_id"),
        resume_version_id=params.get("resume_version_id"),
        scene=params["scene"],
        mode=params["mode"],
        content=text.strip(),
    )
    return {"refs": {"hr_message_id": message.id}, "result": None}


TASK = TaskDef(
    prompt_name="hr_message",
    agent_type="hr_agent",
    event_mode="chunk",
    stages=(),
    assemble=_assemble,
    parse=None,          # 文本任务：chunk 即产物
    persist=_persist,
    conflict_key=lambda params: (
        f"hr_message:{params.get('jd_id')}:{params.get('scene')}" if params.get("jd_id") else None
    ),
)
