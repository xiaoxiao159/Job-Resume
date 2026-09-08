'''任务注册（07 §6 任务矩阵）：10 个 prompt_name → TaskDef 全集

M1 jd_analyze；M2 jd_match / project_expression；M3 resume_generate / reflection；
M4 hr_message；M5 assist×3 / polish_self_eval
'''
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent))

from backend.services.agent_tasks.tasks import assist, hr_message, jd_analyze, \
    jd_match, polish_self_eval, project_expression, reflection, resume_generate

TASKS = {
    jd_analyze.TASK.prompt_name: jd_analyze.TASK,
    jd_match.TASK.prompt_name: jd_match.TASK,
    project_expression.TASK.prompt_name: project_expression.TASK,
    resume_generate.TASK.prompt_name: resume_generate.TASK,
    reflection.TASK.prompt_name: reflection.TASK,
    hr_message.TASK.prompt_name: hr_message.TASK,
    assist.QUESTIONNAIRE_TASK.prompt_name: assist.QUESTIONNAIRE_TASK,
    assist.CHAT_TASK.prompt_name: assist.CHAT_TASK,
    assist.REFILL_TASK.prompt_name: assist.REFILL_TASK,
    polish_self_eval.TASK.prompt_name: polish_self_eval.TASK,
}
