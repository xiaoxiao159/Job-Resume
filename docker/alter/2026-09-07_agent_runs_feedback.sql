-- 02-data-model v0.4：agent_runs 补 feedback 列（03 §4.1 👍/👎，05 待确认 #4 采纳）
-- 已建库的一次性演进（07 §13 #5：MVP 不引 Alembic，结构变更 = 改模型 + 一次性 SQL 留档）
-- 执行：docker exec -i job-postgres psql -U postgres -d job_resume < docker/alter/2026-09-07_agent_runs_feedback.sql
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS feedback TEXT;
