-- Seed last two complete Mon–Fri weeks for Resource Planner + Confirmations.
-- Uses live employees / projects / milestones / activities (activity_id FK).
-- Idempotent for reason = 'seed:last-2-weeks'.
--
-- Run (PowerShell):
--   Get-Content -Raw scripts\seed-last-2-weeks.sql | docker compose exec -T postgres psql -U admin -d oneview -v ON_ERROR_STOP=1

BEGIN;

CREATE TEMP TABLE seed_weeks AS
WITH bounds AS (
  SELECT
    (CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int - 1)))::date AS this_monday
)
SELECT
  (this_monday - 14) AS w1_start,
  (this_monday - 10) AS w1_end,
  (this_monday - 7)  AS w2_start,
  (this_monday - 3)  AS w2_end
FROM bounds;

UPDATE projects p
SET
  start_date = LEAST(p.start_date, (SELECT w1_start FROM seed_weeks)),
  kickoff_date = LEAST(COALESCE(p.kickoff_date, p.start_date), (SELECT w1_start FROM seed_weeks)),
  end_date = GREATEST(p.end_date, (SELECT w2_end FROM seed_weeks)),
  modified_at = NOW(),
  version = p.version + 1
WHERE p.is_deleted = false
  AND p.is_active = true;

UPDATE allocations
SET is_deleted = true, is_active = false, deleted_at = NOW(), modified_at = NOW()
WHERE reason = 'seed:last-2-weeks'
  AND is_deleted = false;

DELETE FROM work_confirmation_lines
WHERE confirmation_id IN (
  SELECT wc.id
  FROM work_confirmations wc
  WHERE wc.work_date BETWEEN (SELECT w1_start FROM seed_weeks) AND (SELECT w2_end FROM seed_weeks)
    AND wc.employee_id IN (SELECT id FROM employees WHERE is_deleted = false AND is_active = true)
);
DELETE FROM work_confirmations
WHERE work_date BETWEEN (SELECT w1_start FROM seed_weeks) AND (SELECT w2_end FROM seed_weeks)
  AND employee_id IN (SELECT id FROM employees WHERE is_deleted = false AND is_active = true);

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
  (SELECT id FROM activities WHERE name = 'Documentation' AND is_deleted = false LIMIT 1) AS act_docs,
  (SELECT id FROM activities WHERE name = 'Internal Meeting' AND is_deleted = false LIMIT 1) AS act_meeting;

INSERT INTO allocations (
  employee_id, project_id, milestone_id, activity_id, tasks,
  start_date, end_date, hours_per_day, reason,
  is_active, is_deleted, created_at, modified_at, version
)
SELECT employee_id, project_id, milestone_id, activity_id, tasks,
       start_date, end_date, hours_per_day, 'seed:last-2-weeks',
       true, false, NOW(), NOW(), 1
FROM (
  SELECT s.anil AS employee_id, s.amul AS project_id, s.amul_ms AS milestone_id, s.act_feature AS activity_id,
         ARRAY['API wiring']::text[] AS tasks, w.w1_start AS start_date, w.w1_end AS end_date, 4.0::float8 AS hours_per_day
  FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.digant, s.amul, s.amul_ms, s.act_feature, ARRAY['UI screens'], w.w1_start, w.w1_end, 6.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.amit, s.amul, s.amul_ms, s.act_design, ARRAY['Wireframes'], w.w1_start, w.w1_end, 5.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.persist_emp, s.persist_prj, s.persist_ms, s.act_review, ARRAY['PR review'], w.w1_start, w.w1_end, 3.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.test_emp, s.persist_prj, s.persist_ms, s.act_support, ARRAY['Tickets'], w.w1_start, w.w1_end, 6.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.ravi, s.skyview, s.sky_ms, s.act_qa, ARRAY['Smoke tests'], w.w1_start, w.w1_end, 5.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.anil, s.persist_prj, s.persist_ms, s.act_standup, ARRAY['Standup'], w.w1_start, w.w1_end, 1.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.digant, s.skyview, s.sky_ms, s.act_docs, ARRAY['Notes'], w.w1_start, w.w1_end, 2.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.anil, s.amul, s.amul_ms, s.act_bug, ARRAY['Hotfixes'], w.w2_start, w.w2_end, 5.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.digant, s.amul, s.amul_ms, s.act_feature, ARRAY['Planner'], w.w2_start, w.w2_end, 6.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.amit, s.skyview, s.sky_ms, s.act_design, ARRAY['Prototype'], w.w2_start, w.w2_end, 4.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.persist_emp, s.amul, s.amul_ms, s.act_feature, ARRAY['Auth'], w.w2_start, w.w2_end, 4.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.test_emp, s.persist_prj, s.persist_ms, s.act_support, ARRAY['Escalations'], w.w2_start, w.w2_end, 5.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.ravi, s.amul, s.amul_ms, s.act_qa, ARRAY['Regression'], w.w2_start, w.w2_end, 6.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.amit, s.amul, s.amul_ms, s.act_meeting, ARRAY['Design sync'], w.w2_start, w.w2_end, 2.0 FROM seed_ids s, seed_weeks w
  UNION ALL
  SELECT s.digant, s.persist_prj, s.persist_ms, s.act_review, ARRAY['Reviews'], w.w2_start, w.w2_end, 2.0 FROM seed_ids s, seed_weeks w
) x
WHERE employee_id IS NOT NULL
  AND project_id IS NOT NULL
  AND milestone_id IS NOT NULL
  AND activity_id IS NOT NULL;

WITH days AS (
  SELECT d::date AS work_date
  FROM generate_series(
    (SELECT w1_start FROM seed_weeks),
    (SELECT w2_end FROM seed_weeks),
    INTERVAL '1 day'
  ) d
  WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
),
emps AS (
  SELECT id AS employee_id, hrms_id
  FROM employees
  WHERE is_deleted = false AND is_active = true
),
to_confirm AS (
  SELECT e.employee_id, d.work_date
  FROM emps e
  CROSS JOIN days d
  WHERE NOT (
    EXTRACT(ISODOW FROM d.work_date) = 5
    AND e.hrms_id IN ('EMP-0004', 'EMP-9999')
  )
),
ins AS (
  INSERT INTO work_confirmations (
    employee_id, work_date, submitted_at, is_missed_posting, has_deviation,
    is_active, is_deleted, created_at, modified_at, version
  )
  SELECT
    t.employee_id,
    t.work_date,
    (t.work_date + TIME '18:15') AT TIME ZONE 'Asia/Kolkata',
    false,
    (EXTRACT(ISODOW FROM t.work_date) = 3),
    true, false, NOW(), NOW(), 1
  FROM to_confirm t
  RETURNING id, employee_id, work_date, has_deviation
)
INSERT INTO work_confirmation_lines (
  confirmation_id, allocation_id, project_label, milestone_label,
  activity, planned_hours, actual_hours, kind, reason, tasks, created_at
)
SELECT
  i.id,
  a.id,
  p.name,
  pm.name,
  act.name,
  a.hours_per_day,
  CASE WHEN i.has_deviation THEN GREATEST(1, a.hours_per_day - 1) ELSE a.hours_per_day END,
  CASE WHEN i.has_deviation THEN 'deviation'::"ConfirmationLineKind" ELSE 'planned'::"ConfirmationLineKind" END,
  CASE WHEN i.has_deviation THEN 'Meeting overrun' ELSE '' END,
  a.tasks,
  NOW()
FROM ins i
JOIN allocations a
  ON a.employee_id = i.employee_id
 AND a.is_deleted = false
 AND a.reason = 'seed:last-2-weeks'
 AND i.work_date BETWEEN a.start_date AND a.end_date
JOIN projects p ON p.id = a.project_id
JOIN project_milestones pm ON pm.id = a.milestone_id
JOIN activities act ON act.id = a.activity_id;

INSERT INTO work_confirmation_lines (
  confirmation_id, allocation_id, project_label, milestone_label,
  activity, planned_hours, actual_hours, kind, reason, tasks, created_at
)
SELECT
  wc.id,
  NULL,
  'Amul',
  'Ad-hoc',
  'Support Queue',
  0,
  1.5,
  'unplanned'::"ConfirmationLineKind",
  'Production support call',
  ARRAY['Urgent ticket'],
  NOW()
FROM work_confirmations wc
JOIN employees e ON e.id = wc.employee_id
WHERE e.hrms_id = 'EMP-0002'
  AND wc.work_date = (SELECT w2_start FROM seed_weeks) + 2
  AND wc.is_deleted = false
LIMIT 1;

INSERT INTO work_confirmations (
  employee_id, work_date, submitted_at, is_missed_posting, miss_reason, has_deviation,
  is_active, is_deleted, created_at, modified_at, version
)
SELECT
  e.id,
  d::date,
  (d::date + TIME '23:59') AT TIME ZONE 'Asia/Kolkata',
  true,
  'Did not confirm by cutoff',
  false,
  true, false, NOW(), NOW(), 1
FROM employees e
CROSS JOIN generate_series(
  (SELECT w1_start FROM seed_weeks),
  (SELECT w2_end FROM seed_weeks),
  INTERVAL '1 day'
) d
WHERE e.hrms_id IN ('EMP-0004', 'EMP-9999')
  AND e.is_deleted = false
  AND e.is_active = true
  AND EXTRACT(ISODOW FROM d) = 5
ON CONFLICT (employee_id, work_date) DO NOTHING;

COMMIT;

SELECT 'weeks' AS k, w1_start::text AS a, w1_end::text AS b, w2_start::text AS c, w2_end::text AS d FROM seed_weeks;
SELECT 'allocations' AS k, count(*)::text AS a, '' AS b, '' AS c, '' AS d
FROM allocations WHERE reason = 'seed:last-2-weeks' AND is_deleted = false;
SELECT 'confirmations' AS k, count(*)::text, count(*) FILTER (WHERE is_missed_posting)::text, count(*) FILTER (WHERE has_deviation)::text, ''
FROM work_confirmations
WHERE work_date BETWEEN (SELECT w1_start FROM seed_weeks) AND (SELECT w2_end FROM seed_weeks) AND is_deleted = false;
SELECT 'lines' AS k, count(*)::text, '' , '', ''
FROM work_confirmation_lines wcl
JOIN work_confirmations wc ON wc.id = wcl.confirmation_id
WHERE wc.work_date BETWEEN (SELECT w1_start FROM seed_weeks) AND (SELECT w2_end FROM seed_weeks);
