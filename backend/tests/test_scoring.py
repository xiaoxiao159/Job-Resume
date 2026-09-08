'''scoring.py 单元测试（05 §4.2 示例 + 边界）'''
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.services.scoring import match_score, overall_score


def test_example_from_design():
    # 05 §4.2 原文示例：core {Python 5, RAG 5, LangGraph 4, FastAPI 4} + plus {Docker 3, Redis 2}
    # strong 4 项，partial 1 项（Docker），missing 1 项（Redis）→ (5+5+4+4 + 0.5×3 + 0×2)/23 = 19.5/23 ≈ 84.78 → 85
    core = {"Python": 5, "RAG": 5, "LangGraph": 4, "FastAPI": 4}
    plus = {"Docker": 3, "Redis": 2}
    strong = {"Python", "RAG", "LangGraph", "FastAPI"}
    partial = {"Docker"}
    missing = {"Redis"}
    assert overall_score(core, plus, strong, partial, missing) == 85


def test_perfect_strong():
    core = {"Python": 5, "RAG": 4}
    plus = {"Docker": 2}
    assert overall_score(core, plus, {"Python", "RAG", "Docker"}, set(), set()) == 100


def test_all_missing():
    core = {"Python": 5}
    assert overall_score(core, {}, set(), set(), {"Python"}) == 0


def test_no_skills_returns_none():
    assert overall_score({}, {}, set(), set(), set()) is None


def test_star_lookup_core_priority_and_unlisted():
    # 未在 core/plus 收录的技能（LLM 幻觉名）星数 0，只落入分母零贡献
    core = {"Python": 5, "RAG": 4}
    strong = {"Python", "Kubernetes"}  # Kubernetes 不在画像 → 星数 0
    assert overall_score(core, {}, strong, {"RAG"}, set()) == round(100 * 7 / 9)  # (5 + 2) / 9


def test_duplicate_classification_strong_wins():
    core = {"Python": 5}
    assert overall_score(core, {}, {"Python"}, {"Python"}, set()) == 100
    assert overall_score(core, {}, set(), {"Python"}, {"Python"}) == 50


def test_match_score_basic():
    assert match_score(3, 1) == 75
    assert match_score(0, 0) is None
    assert match_score(0, 5) == 0
    assert match_score(1, 2) == 33  # round(33.33)


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print("ok", fn.__name__)
    print(f"{len(fns)} tests passed")