'''
确定性计分服务（05 决定 #8 / 07 §7.1）：纯函数，不经过 LLM，配单元测试

- overall_score：岗位匹配度 = round(100 × Σ(stars×s) / Σ(stars))
  s ∈ {strong→1.0, partial→0.5, missing→0}（05 §4.2 示例：19.5/23 → 85）
- match_score：Reflection 命中率 = round(100 × hit/(hit+missing))（05 §4.5）
'''
from typing import Optional

STRONG_WEIGHT = 1.0
PARTIAL_WEIGHT = 0.5
MISSING_WEIGHT = 0.0


def _skill_stars(skill: str, core: dict[str, int], plus: dict[str, int]) -> int:
    '''技能星数查询：core 优先，其次 plus；未收录返回 0'''
    return core.get(skill, plus.get(skill, 0))


def overall_score(
    core_skills: dict[str, int],
    plus_skills: dict[str, int],
    strong: set[str],
    partial: set[str],
    missing: set[str],
) -> Optional[int]:
    '''岗位匹配度（05 §4.2）：Σ(stars×s)/Σ(stars) 百分制取整

    - core_skills/plus_skills：JD 画像技能名 → 星数
    - strong/partial/missing：该技能对简历的命中分类（LLM 判定）；同名多集时按 strong > partial > missing 收敛
    - 技能总星数为 0 → None（无从计算，调用方按「无匹配分」处理）
    '''
    total_stars = sum(core_skills.values()) + sum(plus_skills.values())
    if total_stars == 0:
        return None

    dealt: set[str] = set()
    weighted = 0.0
    for skills, weight in ((strong, STRONG_WEIGHT), (partial, PARTIAL_WEIGHT), (missing, MISSING_WEIGHT)):
        for skill in skills:
            if skill in dealt:  # 同名多集：先出现的分类优先级更高
                continue
            dealt.add(skill)
            weighted += _skill_stars(skill, core_skills, plus_skills) * weight

    return round(100 * weighted / total_stars)


def match_score(hit: int, missing: int) -> Optional[int]:
    '''Reflection 命中率（05 §4.5）：round(100 × hit/(hit+missing))；无从计算（0/0）→ None'''
    if hit + missing == 0:
        return None
    return round(100 * hit / (hit + missing))