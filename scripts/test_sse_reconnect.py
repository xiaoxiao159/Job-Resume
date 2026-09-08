"""
SSE 断线重连专项测试（04 §3.2）：中途断开 → 重连重放 + 完成后一次性重放

验证点：
 1. 运行中任务：订阅读到前 2 个事件后强行断开（模拟 EventSource 断线）
 2. 重连：新订阅从缓冲重放已发事件（前缀一致）并续流至 done
 3. 完成后再订阅：一次性重放全部事件（幂等回放，含 done 终帧）
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx2

BASE = "http://127.0.0.1:8000/api/v1"
client = httpx2.Client(base_url=BASE, timeout=httpx2.Timeout(220, connect=15), trust_env=False)

PASS, FAIL = [], []


def check(name, cond, extra=""):
    (PASS if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  -> {extra}" if extra else ""))


def read_n(run_id: str, n: int) -> list[tuple[str, dict]]:
    """读前 n 个事件后**中途断开**（with 块内 break → 连接关闭，任务仍在跑）"""
    events: list[tuple[str, dict]] = []
    cur = ""
    with client.stream("GET", f"/agent-runs/{run_id}/events") as r:
        for line in r.iter_lines():
            if line.startswith("event: "):
                cur = line[7:]
            elif line.startswith("data: "):
                events.append((cur, json.loads(line[6:])))
                if len(events) >= n:
                    break  # 提前退出 with → 半途断线
    return events


def read_all(run_id: str) -> list[tuple[str, dict]]:
    """订阅至终态（done/error）"""
    events: list[tuple[str, dict]] = []
    cur = ""
    with client.stream("GET", f"/agent-runs/{run_id}/events") as r:
        for line in r.iter_lines():
            if line.startswith("event: "):
                cur = line[7:]
            elif line.startswith("data: "):
                events.append((cur, json.loads(line[6:])))
                if cur in ("done", "error"):
                    break
    return events


print("== 1. 触发任务（jd_analyze，LLM 耗时即断线窗口）==")
r = client.post("/job-descriptions", json={
    "title": "SSE 重连测试 JD", "company": "测试科技",
    "raw_text": "岗位职责：负责后端开发，Python/FastAPI。任职要求：熟悉 Docker、Redis，了解 LLM 应用。"})
check("JD 创建 201", r.status_code == 201)
jd_id = r.json()["data"]["id"]
r = client.post(f"/job-descriptions/{jd_id}/analyze")
check("analyze 202", r.status_code == 202)
run_id = r.json()["data"]["agent_run_id"]

print("== 2. 订阅 → 读 2 事件后断线 ==")
first = read_n(run_id, 2)
check("断线前收到 ≥2 事件", len(first) >= 2, f"n={len(first)} types={[t for t, _ in first]}")

# 断线后任务继续推进：等 2s 让服务端多积累事件
time.sleep(2)

print("== 3. 重连 → 重放前缀一致 + 续流至 done ==")
second = read_all(run_id)
check("重连订阅终态 done", bool(second) and second[-1][0] == "done",
      f"last={second[-1][0] if second else 'EMPTY'}")
prefix_ok = second[:len(first)] == first
check("重连重放：已见事件作为前缀完整重放", prefix_ok,
      f"first={[t for t, _ in first]} second_head={[t for t, _ in second[:len(first)]]}")
n_new = len(second) - len(first)
print(f"  重连后新收事件 {n_new} 条（断线窗口期事件经缓冲补齐）")

print("== 4. 完成后再订阅 → 一次性全量重放（幂等） ==")
third = read_all(run_id)
check("完成后重放与首次全程一致", third == second,
      f"lens: third={len(third)} second={len(second)}")
check("重放含 done 终帧", third and third[-1][0] == "done")

print("\n== 汇总 ==")
print(f"PASS {len(PASS)} / FAIL {len(FAIL)}")
if FAIL:
    for f in FAIL:
        print("  -", f)
    sys.exit(1)
print("SSE 断线重连测试通过 ✔")
