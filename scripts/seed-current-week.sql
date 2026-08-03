-- Seed Resource Planner allocations for the *current* Mon–Fri week.
-- Uses live employees / projects / milestones / activities (activity_id FK).
-- Idempotent for reason = 'seed:current-week'.
--
-- Run (PowerShell):
--   Get-Content -Raw scripts\seed-current-week.sql | docker compose exec -T postgres psql -U admin -d oneview -v ON_ERROR_STOP=1

BEGIN;

CREATE TEMP TABLE cw AS
SELECT
  (CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int - 1)))::date AS w_start,
  (CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int - 1)) + 4)::date AS w_end;

UPDATE projects p
SET end_date = GREATEST(p.end_date, (SELECT w_end FROM cw)),
    modified_at = NOW(),
    version = p.version + 1
WHERE p.is_deleted = false AND p.is_active = true;

UPDATE allocations
SET is_deleted = true, is_active = false, deleted_at = NOW(), modified_at = NOW()
WHERE reason = 'seed:current-week' AND is_deleted = false;

CREATE TEMP TABLE seed_ids AS
SELECT
  (SELECT id FROM employees WHERE hrms_id = 'EMP-0001' AND is_deleted = false LIMIT 1) AS anil,
  (SELECT id FROM employees WHERE hrms_id = 'EMP-0002' AND is_deleted = false LIMIT 1) AS digant,
  (SELECT id FROM employees WHERE hrms_id = 'EMP-0004' AND is_deleted = false LIMIT 1) AS amit,
  (SELECT id FROM employees WHERE hrms_id = 'EMP-TEST1' AND is_deleted = false LIMIT 1) AS persist_emp,
  (SELECT id FROM employees WHERE hrms_id = 'EMP-9999' AND is_deleted = false LIMIT 1) AS test_emp,
  (SELECT id FROM employees WHERE hrms_id = 'EMP-1234' AND is_deleted = false LIMIT 1) AS ravi,
  (SELECT id FROM projects WHERE project_code = 'PRJ-002' AND is_deleted = false LIMIT 1) AS amul,
  (SELECT id FROM projects WHERE project_code = 'PRJ-TEST1' AND is_deleted = false LIMIT 1) AS persist_prj,
  (SELECT id FROM projects WHERE project_code = 'PRJ-003' AND is_deleted = false LIMIT 1) AS skyview,
  (SELECT id FROM project_milestones WHERE project_id = (SELECT id FROM projects WHERE project_code = 'PRJ-002' AND is_deleted = false LIMIT 1) AND is_deleted = false ORDER BY id DESC LIMIT 1) AS amul_ms,
  (SELECT id FROM project_milestones WHERE project_id = (SELECT id FROM projects WHERE project_code = 'PRJ-TEST1' AND is_deleted = false LIMIT 1) AND is_deleted = false ORDER BY id DESC LIMIT 1) AS persist_ms,
  (SELECT id FROM project_milestones WHERE project_id = (SELECT id FROM projects WHERE project_code = 'PRJ-003' AND is_deleted = false LIMIT 1) AND is_deleted = false ORDER BY id DESC LIMIT 1) AS sky_ms,
  (SELECT id FROM activities WHERE name = 'Feature Development' AND is_deleted = false LIMIT 1) AS act_feature,
  (SELECT id FROM activities WHERE name = 'Bug Fixing' AND is_deleted = false LIMIT 1) AS act_bug,
  (SELECT id FROM activities WHERE name = 'Code Review' AND is_deleted = false LIMIT 1) AS act_review,
  (SELECT id FROM activities WHERE name = 'Testing / QA' AND is_deleted = false LIMIT 1) AS act_qa,
  (SELECT id FROM activities WHERE name = 'Design & Prototyping' AND is_deleted = false LIMIT 1) AS act_design,
  (SELECT id FROM activities WHERE name = 'Support Queue' AND is_deleted = false LIMIT 1) AS act_support,
  (SELECT id FROM activities WHERE name = 'Team Sync / Standup' AND is_deleted = false LIMIT 1) AS act_standup,
  (SELECT id FROM activities WHERE name = 'Documentation' AND is_deleted = false LIMIT 1) AS act_docs;

INSERT INTO allocations (
  employee_id, project_id, milestone_id, activity_id, tasks,
  start_date, end_date, hours_per_day, reason,
  is_active, is_deleted, created_at, modified_at, version
)
SELECT employee_id, project_id, milestone_id, activity_id, tasks,
       start_date, end_date, hours_per_day, 'seed:current-week',
       true, false, NOW(), NOW(), 1
FROM (
  SELECT s.anil, s.amul, s.amul_ms, s.act_feature, ARRAY['Sprint delivery']::text[], c.w_start, c.w_end, 5.0::float8 FROM seed_ids s, cw c
  UNION ALL
  SELECT s.digant, s.amul, s.amul_ms, s.act_feature, ARRAY['Current week UI'], c.w_start, c.w_end, 6.0 FROM seed_ids s, cw c
  UNION ALL
  SELECT s.amit, s.skyview, s.sky_ms, s.act_design, ARRAY['SkyView UX'], c.w_start, c.w_end, 5.0 FROM seed_ids s, cw c
  UNION ALL
  SELECT s.persist_emp, s.persist_prj, s.persist_ms, s.act_review, ARRAY['Code reviews'], c.w_start, c.w_end, 4.0 FROM seed_ids s, cw c
  UNION ALL
  SELECT s.test_emp, s.persist_prj, s.persist_ms, s.act_support, ARRAY['Support queue'], c.w_start, c.w_end, 6.0 FROM seed_ids s, cw c
  UNION ALL
  SELECT s.ravi, s.amul, s.amul_ms, s.act_qa, ARRAY['Test pass'], c.w_start, c.w_end, 5.0 FROM seed_ids s, cw c
  UNION ALL
  SELECT s.anil, s.persist_prj, s.persist_ms, s.act_standup, ARRAY['Standup'], c.w_start, c.w_end, 1.0 FROM seed_ids s, cw c
  UNION ALL
  SELECT s.digant, s.skyview, s.sky_ms, s.act_docs, ARRAY['Release notes'], c.w_start, c.w_end, 2.0 FROM seed_ids s, cw c
  UNION ALL
  SELECT s.ravi, s.skyview, s.sky_ms, s.act_bug, ARRAY['Defects'], c.w_start, c.w_end, 2.0 FROM seed_ids s, cw c
  UNION ALL
  SELECT s.amit, s.amul, s.amul_ms, s.act_design, ARRAY['Amul visuals'], c.w_start, c.w_end, 2.0 FROM seed_ids s, cw c
) x(employee_id, project_id, milestone_id, activity_id, tasks, start_date, end_date, hours_per_day)
WHERE employee_id IS NOT NULL AND project_id IS NOT NULL AND milestone_id IS NOT NULL AND activity_id IS NOT NULL;

COMMIT;

SELECT w_start, w_end FROM cw;
SELECT count(*) AS current_week_allocations
FROM allocations WHERE reason = 'seed:current-week' AND is_deleted = false;
