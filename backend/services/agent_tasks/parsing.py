'''
LLM 结构化输出提取（05 §2.3）：

- reasoner 档不支持 json_object → Prompt 强约束 ```json 围栏，提取器容忍围栏外杂讯
- chat + json_object → 输出即合法 JSON，可能带围栏（模板统一要求围栏），同一提取器兼容
- 提取算法：去围栏 → 首个 { 起、末个 } 止的平衡扫描（引号内花括号不计入平衡），
  提取失败抛 ValueError 由 manager 走降级重试（05 决定 #4 兜底）
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent))

import json
import re
from typing import Any

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def extract_json(raw: str) -> Any:
    '''原始输出 → Python 对象；失败抛 ValueError（触发降级重试）'''
    if raw is None:
        raise ValueError("LLM 输出为空")
    text = raw.strip()

    # 1. 优先取代码围栏内容（模板要求围栏；json_object 模式下输出可能带也可能不带）
    fence_match = _FENCE_RE.search(text)
    candidate = fence_match.group(1).strip() if fence_match else text

    # 2. 截取首个 { 到与之平衡的末个 }（容忍围栏外/前后杂讯）
    start = candidate.find("{")
    if start == -1:
        raise ValueError("输出中找不到 JSON 对象")
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(candidate)):
        ch = candidate[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(candidate[start : i + 1])
    raise ValueError("JSON 对象未闭合")