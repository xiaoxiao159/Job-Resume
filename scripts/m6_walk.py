"""
M6 前端联调巡检：headless 浏览器走 16 路由，收集控制台错误 / 未捕获异常 / API 非 2xx

运行前提：后端 8000 + 前端 vite dev 5173（VITE_USE_MOCK=false）已启动。
动态路由（project/jd/resume/version/hr 详情页）从 API 取真实 id 注入。
判定：每页 pageerror=0 且 console.error=0 且 /api/ 请求无 4xx/5xx → PASS。
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx2
from playwright.sync_api import sync_playwright

FRONT = "http://localhost:5174"  # vite 监听 IPv6 ::1，用 localhost 让浏览器自行解析
API = "http://127.0.0.1:8000/api/v1"

api = httpx2.Client(base_url=API, timeout=30, trust_env=False)


def first(path: str, **params) -> str | None:
    r = api.get(path, params=params)
    if r.status_code != 200:
        return None
    data = r.json().get("data") or []
    return data[0]["id"] if data else None


proj_id = first("/projects")
jd_id = first("/job-descriptions")
resume_id = first("/resumes")
version_id = first(f"/resumes/{resume_id}/versions") if resume_id else None
hr_id = first("/hr-messages")

ROUTES = [
    ("/dashboard", "仪表盘"),
    ("/assets/basic-info", "基本信息"),
    ("/assets/portfolio", "资产组合"),
    ("/projects", "项目列表"),
    (f"/projects/{proj_id}" if proj_id else "/projects", "项目详情"),
    ("/jd", "JD 列表"),
    ("/jd/new", "JD 新建"),
    (f"/jd/{jd_id}" if jd_id else "/jd", "JD 详情"),
    ("/resumes", "简历列表"),
    (f"/resumes/{resume_id}" if resume_id else "/resumes", "简历详情"),
    (f"/resume-versions/{version_id}" if version_id else "/dashboard", "简历 Studio"),
    ("/hr", "HR 文案列表"),
    (f"/hr/{hr_id}" if hr_id else "/hr", "HR 文案详情"),
    ("/applications", "投递记录"),
    ("/interviews", "面试复盘"),
    ("/", "根路由"),
]

PASS, FAIL = [], []


def check(name, cond, extra=""):
    (PASS if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  -> {extra}" if extra else ""))


with sync_playwright() as p:
    try:
        browser = p.chromium.launch(headless=True)
    except Exception:
        browser = p.chromium.launch(headless=True, channel="msedge")

    page = browser.new_page(viewport={"width": 1440, "height": 900})

    # 处理器一次性注册；每页迭代前清空（避免随循环累积重复计数）
    console_errors: list[str] = []
    page_errors: list[str] = []
    api_failures: list[str] = []

    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))
    page.on("response", lambda r: api_failures.append(
        f"{r.status} {r.url.split('5173')[-1]}") if "/api/" in r.url and r.status >= 400 else None)

    for path, label in ROUTES:
        console_errors.clear()
        page_errors.clear()
        api_failures.clear()

        try:
            page.goto(FRONT + path, wait_until="load", timeout=15000)
            page.wait_for_timeout(2500)  # TanStack Query 拉数据 + 首渲染
            body_len = len(page.inner_text("body"))
            check(f"{label} {path}",
                  not page_errors and not console_errors and not api_failures and body_len > 50,
                  f"errors={len(page_errors)} console={len(console_errors)} api={len(api_failures)} "
                  f"text={body_len}字"
                  + (f" | {page_errors[:1] or console_errors[:1] or api_failures[:1]}" if (page_errors or console_errors or api_failures) else ""))
        except Exception as exc:
            check(f"{label} {path}", False, f"导航异常: {str(exc)[:120]}")

    browser.close()

print("\n== 汇总 ==")
print(f"PASS {len(PASS)} / FAIL {len(FAIL)}")
if FAIL:
    for f in FAIL:
        print("  -", f)
    sys.exit(1)
print("M6 页面巡检通过 ✔")
