"""
全量后端冒烟（M2-M5 验收）：50 端点全覆盖的关键链路

运行前提：Postgres（job-postgres 容器）+ uvicorn 已启动，backend/.env 有可用 LLM key。
覆盖（编号 § 对应 smoke_m1 之后的模块）：
 1. Career Assets：basic-info null→PUT upsert；educations CRUD+reorder；skills 409 重名；honors
 2. Projects：CRUD + q 搜索；evidence 嵌套/顶层 PATCH；skills PUT 批量关联；表达生成(LLM)+确认+重生成版本号
 3. AI 辅助填写：questionnaire → chat → refill 三段（LLM，result.follow_up / fields）
 4. polish-self-eval（LLM，result.self_evaluation）
 5. JD：analyze 前置匹配 409 analysis_not_ready；match 生成（LLM）+ 列表 + 程序算分
 6. Resumes：Master 版（skip_llm 快速 done）+ JD 定制版（LLM）+ reflect（LLM）+ preview/export + confirm 锁定
    + regenerate v+1（LLM）+ target_role 409
 7. HR Messages：生成（LLM）+ 列表 + PATCH
 8. Applications：状态机 422（details 字段级）+ interview-qa 公司带出 + Dashboard 统计
 9. agent-runs：detail + feedback up/down 覆盖
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx2

BASE = "http://127.0.0.1:8000/api/v1"
client = httpx2.Client(base_url=BASE, timeout=httpx2.Timeout(220, connect=15), trust_env=False)

PASS: list[str] = []
FAIL: list[str] = []
WARN: list[str] = []


def check(name: str, cond: bool, extra: str = ""):
    (PASS if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  -> {extra}" if extra else ""))


def warn(name: str, extra: str):
    WARN.append(name)
    print(f"WARN  {name}  -> {extra}")


def run_task(path: str, body: dict | None = None, method: str = "POST", expect: int = 202) -> tuple[str, list]:
    """触发任务 → 订阅 SSE 至终态；返回 (agent_run_id, events)"""
    r = client.request(method, path, json=body)
    check(f"{path.split('/')[-1]} {expect}", r.status_code == expect,
          f"status={r.status_code} body={r.text[:120]}")
    if r.status_code != expect:
        return "", []
    run_id = r.json()["data"]["agent_run_id"]
    events = read_events(run_id)
    return run_id, events


def read_events(run_id: str, timeout: float = 200.0) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    cur = ""
    with client.stream("GET", f"/agent-runs/{run_id}/events") as r:
        for line in r.iter_lines():
            if line.startswith("event: "):
                cur = line[len("event: "):]
            elif line.startswith("data: "):
                data = json.loads(line[len("data: "):])
                events.append((cur, data))
                if cur in ("done", "error"):
                    break
    return events


def done_result(events: list) -> dict | None:
    """终态 done → {refs, result}；error → 抛断言信息给调用方 check"""
    if not events:
        return None
    last_t, last_d = events[-1]
    if last_t == "error":
        return None
    return last_d


# ============================================================ 1. Career Assets
print("== 1. Career Assets ==")
r = client.get("/basic-info")
if r.json().get("data") is None:
    check("basic-info GET 首次 200 data=null", r.status_code == 200 and r.json().get("data") is None,
          f"status={r.status_code} body={r.text[:80]}")
else:
    warn("basic-info 已存在（脏库）", "data=null 路径不可复验，PUT upsert 路径仍验证")

r = client.put("/basic-info", json={
    "name": "林小测", "email": "lin@example.com", "phone": "13800000000",
    "github_url": "https://github.com/lin-test", "homepage_url": None,
    "job_role": "AI 应用工程师", "city": "上海", "availability": "within_1_week",
    "self_evaluation": "熟悉 LLM 应用开发，动手能力强。",
})
check("basic-info PUT upsert 200", r.status_code == 200 and r.json()["data"]["name"] == "林小测",
      f"status={r.status_code}")
basic_id = r.json()["data"]["id"]
r = client.get("/basic-info")
check("basic-info GET 回读一致", r.status_code == 200 and r.json()["data"]["id"] == basic_id)

r = client.post("/educations", json={"school": "测试大学", "major": "计算机科学与技术", "degree": "master",
                                     "start_date": "2023-09-01", "end_date": "2026-06-30", "sort_order": 0})
check("educations POST 201+Location", r.status_code == 201 and "location" in {k.lower() for k in r.headers},
      f"status={r.status_code}")
edu1 = r.json()["data"]["id"]
r = client.post("/educations", json={"school": "测试本科大学", "major": "软件工程", "degree": "bachelor",
                                     "start_date": "2019-09-01", "end_date": "2023-06-30", "sort_order": 1})
edu2 = r.json()["data"]["id"]
r = client.put("/educations/reorder", json={"ids": [edu1]})
check("reorder 部分集 422 incomplete", r.status_code == 422, f"status={r.status_code} body={r.text[:80]}")
r = client.put("/educations/reorder", json={"ids": list(reversed(
    [e["id"] for e in client.get("/educations").json()["data"]]))})
check("educations reorder PUT 全量集（含脏库旧行）", r.status_code == 200 and r.json()["data"] is None,
      f"status={r.status_code} body={r.text[:80]}")
r = client.patch(f"/educations/{edu1}", json={"courses": "机器学习、分布式系统"})
check("educations PATCH", r.status_code == 200 and r.json()["data"]["courses"] == "机器学习、分布式系统")
r = client.delete(f"/educations/{edu1}")
check("educations DELETE 204", r.status_code == 204)

client.post("/experiences", json={"type": "research", "name": "LLM 方向科研", "role": "研究助理",
                                  "start_date": "2024-03-01", "end_date": None, "sort_order": 0})
r = client.post("/honors", json={"name": "国家奖学金", "time": "2025 年 10 月"})
check("honors POST 201", r.status_code == 201)

# skills：3 个（幂等：已存在则复用）+ 重名 409
existing = {s["name"]: s["id"] for s in client.get("/skills").json()["data"]}
skill_ids: dict[str, str] = {}
for name, prof in [("Python", "expert"), ("FastAPI", "proficient"), ("Docker", "familiar")]:
    if name in existing:
        skill_ids[name] = existing[name]
        warn(f"skills {name} 已存在（脏库）", "复用 id，POST 路径已在前次冒烟验证")
        continue
    r = client.post("/skills", json={"name": name, "proficiency": prof})
    check(f"skills POST {name} 201", r.status_code == 201, f"status={r.status_code}")
    skill_ids[name] = r.json()["data"]["id"]
r = client.post("/skills", json={"name": "Python", "proficiency": "beginner"})
check("skills 重名 409 skill_name_exists",
      r.status_code == 409 and r.json()["error"]["code"] == "skill_name_exists",
      f"status={r.status_code} body={r.text[:100]}")

# ============================================================ 2. Projects
print("\n== 2. Projects ==")
proj_payload = {
    "name": "AI 求职助手", "summary": "面向求职者的 AI 简历助手",
    "background": "求职者难以针对 JD 定制简历", "goal": "做一个自动定制简历的 Agent 系统",
    "start_date": "2025-06-01", "end_date": None, "role": "独立开发者",
    "tech_stack": ["Python", "FastAPI", "LangGraph"],
    "responsibilities": "负责全部设计与开发", "core_work": "设计 Agent 任务管线，实现 JD 分析与简历装配",
    "difficulties": "多轮 LLM 输出不稳定", "solutions": "引入 Pydantic 结构化解析与程序校验",
    "results": "匹配准确率 92%，生成耗时降低 60%", "sort_order": 0,
}
r = client.post("/projects", json=proj_payload)
check("projects POST 201", r.status_code == 201, f"status={r.status_code}")
proj = r.json()["data"]["id"]

r = client.get("/projects", params={"q": "求职"})
check("projects ?q= 搜索命中", r.status_code == 200 and any(p["id"] == proj for p in r.json()["data"]),
      f"n={len(r.json().get('data', []))}")
r = client.get("/projects", params={"q": "不存在的项目xyz"})
check("projects ?q= 搜索空", r.status_code == 200 and r.json()["data"] == [])

r = client.post(f"/projects/{proj}/evidence", json={"type": "github", "title": "代码仓库",
                                                    "url": "https://github.com/lin-test/job-copilot"})
check("evidence POST 201", r.status_code == 201)
evid = r.json()["data"]["id"]
r = client.patch(f"/evidence/{evid}", json={"note": "含全部源码"})
check("evidence 顶层 PATCH", r.status_code == 200 and r.json()["data"]["note"] == "含全部源码")

r = client.put(f"/projects/{proj}/skills", json={"skill_ids": [skill_ids["Python"], skill_ids["Docker"]]})
check("project skills PUT data=null", r.status_code == 200 and r.json()["data"] is None,
      f"status={r.status_code} body={r.text[:60]}")
r = client.get(f"/projects/{proj}/skills")
names = sorted(s["name"] for s in r.json()["data"])
check("project skills GET 关联生效", names == ["Docker", "Python"], f"skills={names}")

# 表达生成（LLM）→ 确认 → 再生成版本号 +1
_, ev = run_task(f"/projects/{proj}/expressions", {"type": "resume_bullet"})
d = done_result(ev)
check("expression done 终态", d is not None, f"last={ev[-1] if ev else 'EMPTY'}")
if d:
    expr1 = d["refs"]["project_expression_id"]
    check("expression refs 完整", bool(expr1), f"refs={d['refs']}")
    r = client.patch(f"/project-expressions/{expr1}", json={"status": "confirmed"})
    check("expression 确认 confirmed", r.status_code == 200 and r.json()["data"]["status"] == "confirmed")
    content = r.json()["data"]["content"]
    check("expression content.bullets 非空", isinstance(content.get("bullets"), list) and content["bullets"],
          f"content keys={list(content)[:6]}")
_, ev = run_task(f"/projects/{proj}/expressions", {"type": "resume_bullet"})
d = done_result(ev)
if d:
    expr2 = d["refs"]["project_expression_id"]
    r = client.get(f"/projects/{proj}/expressions", params={"type": "resume_bullet"})
    nums = sorted(x["version_number"] for x in r.json()["data"])
    check("expression 重生成留档 v1+v2", nums == [1, 2], f"versions={nums}")
else:
    check("expression 重生成 done", False, "任务失败")

# ============================================================ 3. AI 辅助填写
print("\n== 3. Assist（questionnaire → chat → refill）==")
_, ev = run_task(f"/projects/{proj}/assist/questionnaire", {
    "answers": [{"question": "项目里你个人负责什么？", "answer": "我负责整个 Agent 管线的设计和开发"},
                {"question": "遇到的最大的困难？", "answer": "LLM 输出不稳定，解析经常失败"}]})
d = done_result(ev)
check("questionnaire chunk 流", any(t == "chunk" for t, _ in ev), f"types={[t for t, _ in ev][:8]}")
check("questionnaire result.follow_up", d is not None and bool((d.get("result") or {}).get("follow_up")),
      f"result={str(d and d.get('result'))[:80]}")

_, ev = run_task(f"/projects/{proj}/assist/messages", {
    "messages": [{"role": "user", "content": "输出不稳定最后是怎么解决的？"},
                 {"role": "assistant", "content": "能展开说说当时的具体做法吗？"},
                 {"role": "user", "content": "我加了 Pydantic 校验和重试，解析成功率提到 95%"}]})
d = done_result(ev)
check("chat chunk 流", any(t == "chunk" for t, _ in ev) and d is not None)

_, ev = run_task(f"/projects/{proj}/assist/refill", {
    "messages": [{"role": "user", "content": "我负责整个 Agent 管线的设计和开发"},
                 {"role": "user", "content": "加了 Pydantic 校验和重试，解析成功率 95%"}]})
d = done_result(ev)
fields = (d or {}).get("result", {}).get("fields") if d else None
check("refill result.fields 七字段",
      isinstance(fields, dict) and set(fields) == {"background", "goal", "responsibilities",
                                                   "core_work", "difficulties", "solutions", "results"},
      f"fields={str(fields)[:120]}")

# ============================================================ 4. polish self-eval
print("\n== 4. polish-self-eval ==")
_, ev = run_task("/basic-info/polish-self-eval")
d = done_result(ev)
check("polish result.self_evaluation", d is not None and bool((d.get("result") or {}).get("self_evaluation")),
      f"result={str(d and d.get('result'))[:100]}")

# ============================================================ 5. JD match
print("\n== 5. JD analyze + match ==")
jd_raw = ("岗位职责：1. 负责 AI Agent 应用后端开发，Python/FastAPI。2. LLM 应用架构与流式输出。"
          "任职要求：1. 熟悉 asyncio、SQLAlchemy、PostgreSQL。2. 了解 Prompt 工程。3. 熟悉 Docker、Redis。")
r = client.post("/job-descriptions", json={"title": "AI 应用工程师", "company": "冒烟科技", "raw_text": jd_raw})
jd = r.json()["data"]["id"]
check("JD POST 201", r.status_code == 201)

r = client.post(f"/job-descriptions/{jd}/matches")
check("match 前置 409 analysis_not_ready",
      r.status_code == 409 and r.json()["error"]["code"] == "analysis_not_ready",
      f"status={r.status_code} body={r.text[:100]}")

_, ev = run_task(f"/job-descriptions/{jd}/analyze")
d = done_result(ev)
check("analyze done", d is not None and bool(d["refs"].get("jd_analysis_id")))

_, ev = run_task(f"/job-descriptions/{jd}/matches")
d = done_result(ev)
check("match done", d is not None and bool(d["refs"].get("jd_match_id")), f"last={ev[-1] if ev else ''}")
r = client.get(f"/job-descriptions/{jd}/matches")
m = r.json()["data"][0] if r.json()["data"] else {}
check("match 列表 + overall_score 数值", r.status_code == 200 and isinstance(m.get("overall_score"), int)
      and 0 <= m.get("overall_score", -1) <= 100, f"score={m.get('overall_score')}")
check("match skill_matches 三态结构",
      isinstance(m.get("skill_matches"), list) and all(
          set(s) >= {"name", "status"} and s["status"] in ("strong", "partial", "missing")
          for s in m.get("skill_matches", [])),
      f"n={len(m.get('skill_matches') or [])}")

# ============================================================ 6. Resumes
print("\n== 6. Resumes ==")
import time as _time

role = f"AI 应用工程师-{int(_time.time()) % 1000000}"
r = client.post("/resumes", json={"target_role": role})
check("resumes POST 201 title 缺省取 target_role",
      r.status_code == 201 and r.json()["data"]["title"] == role, f"body={r.text[:100]}")
resume_id = r.json()["data"]["id"]
r = client.post("/resumes", json={"target_role": role})
check("resumes 重复 target_role 409", r.status_code == 409 and r.json()["error"]["code"] == "target_role_exists")

# Master 版（skip_llm：程序装配，SSE 应秒级 done 且 model 为空）
_, ev = run_task(f"/resumes/{resume_id}/versions", {})
d = done_result(ev)
check("Master 版 done", d is not None, f"last={ev[-1] if ev else ''}")
v_master = (d or {}).get("refs", {}).get("resume_version_id", "")
r = client.get(f"/resume-versions/{v_master}")
vc = r.json()["data"]
check("Master 版 version_number=1", vc.get("version_number") == 1)
content = vc["content"]
check("Master 版 8 段快照齐全（前端 ResumeContent 契约段名）",
      set(content) >= {"basic_info", "job_intention", "education", "research", "campus",
                       "projects", "honors", "skills", "self_evaluation", "schema_version"},
      f"keys={sorted(content)}")
check("Master 版 job_intention.role=target_role",
      content["job_intention"].get("role") == role)
bullets = content["projects"][0].get("bullets") if content["projects"] else []
check("Master 版 bullets 取已确认表达（v1 confirmed）", bool(bullets),
      f"bullets={str(bullets)[:80]}")
skill_order = [s["name"] for s in content["skills"]]
check("Master 版技能按熟练度排序（相对序）",
      all(n in skill_order for n in skill_ids)
      and skill_order.index("Python") < skill_order.index("FastAPI") < skill_order.index("Docker"),
      f"order={skill_order}")

# JD 定制版（LLM）
_, ev = run_task(f"/resumes/{resume_id}/versions", {"jd_id": jd})
d = done_result(ev)
v_jd = (d or {}).get("refs", {}).get("resume_version_id", "")
check("JD 定制版 done v2", d is not None and bool(v_jd), f"last={ev[-1] if ev else ''}")

# pending 可编辑
r = client.get(f"/resume-versions/{v_jd}")
edited = r.json()["data"]["content"]
edited["self_evaluation"] = "编辑后的自评（pending 可编辑）"
r = client.patch(f"/resume-versions/{v_jd}", json={"content": edited})
check("pending 版 PATCH 可编辑", r.status_code == 200 and r.json()["data"]["content"]["self_evaluation"].startswith("编辑后"))

# reflect（LLM）
_, ev = run_task(f"/resume-versions/{v_jd}/reflect")
d = done_result(ev)
check("reflect done", d is not None, f"last={ev[-1] if ev else ''}")
r = client.get(f"/resume-versions/{v_jd}")
vr = r.json()["data"]
check("reflect 后状态 passed/issues", vr["reflection_status"] in ("passed", "issues"),
      f"status={vr['reflection_status']}")
rr = vr.get("reflection_result") or {}
check("reflection_result 结构（前端 ReflectionResult 契约）",
      set(rr) == {"coverage", "fabrication", "match_score"}
      and set(rr.get("coverage", {})) == {"hit_keywords", "missing_keywords"}
      and isinstance(rr.get("fabrication", {}).get("passed"), bool)
      and isinstance(rr.get("match_score"), int),
      f"rr={json.dumps(rr, ensure_ascii=False)[:140]}")

# preview / export
r = client.get(f"/resume-versions/{v_jd}/preview", params={"format": "md"})
md = r.text
check("preview md 200 + azi-loc 锚点",
      r.status_code == 200 and "azi-loc:projects[0].bullets[0]" in md, f"len={len(md)}")
r = client.get(f"/resume-versions/{v_jd}/preview", params={"format": "html"})
check("preview html 未选模板 409",
      r.status_code == 409 and r.json()["error"]["code"] == "template_not_selected")
client.patch(f"/resumes/{resume_id}", json={"template": "modern"})
r = client.get(f"/resume-versions/{v_jd}/preview", params={"format": "html"})
check("preview html 选模板后 200", r.status_code == 200 and "<html" in r.text.lower(), f"len={len(r.text)}")

r = client.get(f"/resume-versions/{v_jd}/export", params={"format": "html"})
check("export html attachment",
      r.status_code == 200 and "attachment" in r.headers.get("content-disposition", ""),
      r.headers.get("content-disposition", "")[:80])
r = client.get(f"/resume-versions/{v_jd}/export", params={"format": "pdf"})
check("export pdf（200 文件 或 501 pdf_not_available）",
      (r.status_code == 200 and r.headers.get("content-type", "").startswith("application/pdf"))
      or (r.status_code == 501 and r.json()["error"]["code"] == "pdf_not_available"),
      f"status={r.status_code}")

# confirm 定稿（reflect 已跑 → 不再 pending）+ 锁定
r = client.post(f"/resume-versions/{v_jd}/confirm")
check("confirm 200 locked", r.status_code == 200 and r.json()["data"]["locked"] is True, f"body={r.text[:120]}")
r = client.patch(f"/resume-versions/{v_jd}", json={"content": edited})
check("定稿后 PATCH 409 locked_version",
      r.status_code == 409 and r.json()["error"]["code"] == "locked_version")

# regenerate → v3（LLM）
_, ev = run_task(f"/resume-versions/{v_jd}/regenerate", {"instruction": "自评更突出工程落地能力"})
d = done_result(ev)
check("regenerate done v3", d is not None, f"last={ev[-1] if ev else ''}")
r = client.get(f"/resumes/{resume_id}/versions")
nums = sorted(v["version_number"] for v in r.json()["data"])
check("版本列表 1+2+3", nums == [1, 2, 3], f"nums={nums}")

# ============================================================ 7. HR Messages
print("\n== 7. HR Messages ==")
_, ev = run_task("/hr-messages", {"jd_id": jd, "resume_version_id": v_jd,
                                  "scene": "boss_zhipin", "mode": "short"})
d = done_result(ev)
hr_id = (d or {}).get("refs", {}).get("hr_message_id", "")
check("hr_message done refs", bool(hr_id), f"refs={(d or {}).get('refs')}")
r = client.get(f"/hr-messages/{hr_id}")
hr_content = r.json()["data"]["content"]
check("hr content 落库非空", r.status_code == 200 and bool(hr_content), f"content={str(hr_content)[:60]}")
r = client.get("/hr-messages", params={"jd_id": jd})
check("hr 列表 ?jd_id 过滤", r.status_code == 200 and any(m["id"] == hr_id for m in r.json()["data"]))
r = client.patch(f"/hr-messages/{hr_id}", json={"content": "手工改写后的文案"})
check("hr PATCH 编辑", r.status_code == 200 and r.json()["data"]["content"] == "手工改写后的文案")

# ============================================================ 8. Applications + QA + Dashboard
print("\n== 8. Applications / Interview QA / Dashboard ==")
r = client.post("/applications", json={"company": "冒烟科技", "position": "AI 应用工程师",
                                       "status": "to_apply", "applied_at": None,
                                       "resume_version_id": v_jd, "note": None})
check("applications POST to_apply 201", r.status_code == 201, f"body={r.text[:100]}")
app = r.json()["data"]["id"]
app_data = r.json()["data"]
check("application 携带版本摘要",
      (app_data.get("resume_version") or {}).get("version_number") == 2,
      f"resume_version={app_data.get('resume_version')}")

r = client.patch(f"/applications/{app}", json={"status": "interview"})
err = r.json().get("error", {})
check("非待投递缺 applied_at 422 + details 字段级",
      r.status_code == 422 and err.get("code") == "validation_error"
      and any(d.get("field") == "applied_at" for d in err.get("details") or []),
      f"status={r.status_code} body={r.text[:140]}")
r = client.patch(f"/applications/{app}", json={"status": "interview", "applied_at": "2026-09-06"})
check("带 applied_at 流转 200", r.status_code == 200 and r.json()["data"]["status"] == "interview")

r = client.post("/interview-qa", json={"application_id": app, "company": "错误的公司", "position": "错误的岗位",
                                       "interview_at": "2026-09-08", "question": "讲讲你的 Agent 管线设计",
                                       "answer": None, "note": None})
qa = r.json()["data"]
check("interview-qa 公司/岗位从投递带出（覆盖 body）",
      r.status_code == 201 and qa["company"] == "冒烟科技" and qa["position"] == "AI 应用工程师",
      f"company={qa.get('company')} position={qa.get('position')}")
r = client.get("/interview-qa", params={"company": "冒烟科技"})
check("interview-qa ?company 过滤", r.status_code == 200 and len(r.json()["data"]) >= 1)

r = client.get("/dashboard")
dash = r.json().get("data", {})
stats = dash.get("stats", {})
check("dashboard stats 统计（程序算，非 LLM）",
      r.status_code == 200 and stats.get("applied", 0) >= 1 and "reply_rate" in stats,
      f"stats={stats}")
check("dashboard recent_applications 带出",
      isinstance(dash.get("recent_applications"), list) and len(dash["recent_applications"]) >= 1)
check("dashboard asset_progress",
      set(dash.get("asset_progress", {})) >= {"basic_info", "projects_count", "skills_count", "education_count"},
      f"progress={dash.get('asset_progress')}")

# ============================================================ 9. agent-runs detail + feedback
print("\n== 9. agent-runs 可观测性 + feedback ==")
r = client.get("/agent-runs", params={"per_page": 5})
runs = r.json()["data"]
check("agent-runs 列表（含全部任务类型）", r.status_code == 200 and len(runs) >= 5, f"n={len(runs)}")
types = {x["agent_type"] for x in runs}
check("agent_type 覆盖多类", len(types) >= 3, f"types={types}")

some_run = runs[0]["id"]
r = client.get(f"/agent-runs/{some_run}")
check("agent-run detail", r.status_code == 200 and r.json()["data"]["status"] == "completed")

r = client.post(f"/agent-runs/{some_run}/feedback", json={"feedback": "up"})
check("feedback up → data:null", r.status_code == 200 and r.json()["data"] is None, f"body={r.text[:60]}")
r = client.post(f"/agent-runs/{some_run}/feedback", json={"feedback": "down"})
r = client.get(f"/agent-runs/{some_run}")
check("feedback down 覆盖生效", r.json()["data"].get("feedback") == "down",
      f"feedback={r.json()['data'].get('feedback')}")
r = client.post("/agent-runs/00000000-0000-0000-0000-000000000000/feedback", json={"feedback": "up"})
check("feedback 不存在 run 404", r.status_code == 404)

# ============================================================ 汇总
print("\n== 汇总 ==")
print(f"PASS {len(PASS)} / FAIL {len(FAIL)} / WARN {len(WARN)}")
if FAIL:
    print("失败项：")
    for f in FAIL:
        print("  -", f)
    sys.exit(1)
print("全量冒烟通过 ✔")
