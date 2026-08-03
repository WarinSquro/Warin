-- Seed 2nd-last complete Mon–Fri week for Work Confirmation + Weekly Check-In
-- (Utilization uses allocations + confirmations for that week).
--
-- Week relative to ISO Monday of CURRENT_DATE:
--   w_start = this_monday - 14
--   w_end   = this_monday - 10
-- Around 2026-07-20 that is 2026-07-06 – 2026-07-10.
--
-- Idempotent for reason = 'seed:2nd-last-week-confirmation-wci'.
-- Does NOT wipe other weeks. Does NOT soft-delete seed:last-2-weeks /
-- seed:current-week allocations; only adds allocations/confirmations when gaps
-- exist for this week. Always upserts WCI submissions for the seed employees.
--
-- Run (PowerShell):
--   Get-Content -Raw scripts\seed-2nd-last-week-confirmation-wci.sql | docker compose exec -T postgres psql -U admin -d oneview -v ON_ERROR_STOP=1

BEGIN;

CREATE TEMP TABLE seed_week AS
WITH bounds AS (
  SELECT
    (CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int - 1)))::date AS this_monday
)
SELECT
  (this_monday - 14) AS w_start,
  (this_monday - 10) AS w_end
FROM bounds;

UPDATE projects p
SET
  start_date = LEAST(p.start_date, (SELECT w_start FROM seed_week)),
  kickoff_date = LEAST(COALESCE(p.kickoff_date, p.start_date), (SELECT w_start FROM seed_week)),
  end_date = GREATEST(p.end_date, (SELECT w_end FROM seed_week)),
  modified_at = NOW(),
  version = p.version + 1
WHERE p.is_deleted = false
  AND p.is_active = true;

-- Clear prior rows owned by this seed reason (allocations only — confirmations/WCI use unique keys).
UPDATE allocations
SET is_deleted = true, is_active = false, deleted_at = NOW(), modified_at = NOW()
WHERE reason = 'seed:2nd-last-week-confirmation-wci'
  AND is_deleted = false;

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

-- Allocations: insert only when this week has no active covering allocation for the seed cohort.
INSERT INTO allocations (
  employee_id, project_id, milestone_id, activity_id, tasks,
  start_date, end_date, hours_per_day, reason,
  is_active, is_deleted, created_at, modified_at, version
)
SELECT employee_id, project_id, milestone_id, activity_id, tasks,
       start_date, end_date, hours_per_day, 'seed:2nd-last-week-confirmation-wci',
       true, false, NOW(), NOW(), 1
FROM (
  SELECT s.anil AS employee_id, s.amul AS project_id, s.amul_ms AS milestone_id, s.act_feature AS activity_id,
         ARRAY['API wiring']::text[] AS tasks, w.w_start AS start_date, w.w_end AS end_date, 4.0::float8 AS hours_per_day
  FROM seed_ids s, seed_week w
  UNION ALL
  SELECT s.digant, s.amul, s.amul_ms, s.act_feature, ARRAY['UI screens'], w.w_start, w.w_end, 6.0 FROM seed_ids s, seed_week w
  UNION ALL
  SELECT s.amit, s.amul, s.amul_ms, s.act_design, ARRAY['Wireframes'], w.w_start, w.w_end, 5.0 FROM seed_ids s, seed_week w
  UNION ALL
  SELECT s.persist_emp, s.persist_prj, s.persist_ms, s.act_review, ARRAY['PR review'], w.w_start, w.w_end, 3.0 FROM seed_ids s, seed_week w
  UNION ALL
  SELECT s.test_emp, s.persist_prj, s.persist_ms, s.act_support, ARRAY['Tickets'], w.w_start, w.w_end, 6.0 FROM seed_ids s, seed_week w
  UNION ALL
  SELECT s.ravi, s.skyview, s.sky_ms, s.act_qa, ARRAY['Smoke tests'], w.w_start, w.w_end, 5.0 FROM seed_ids s, seed_week w
  UNION ALL
  SELECT s.anil, s.persist_prj, s.persist_ms, s.act_standup, ARRAY['Standup'], w.w_start, w.w_end, 1.0 FROM seed_ids s, seed_week w
  UNION ALL
  SELECT s.digant, s.skyview, s.sky_ms, s.act_docs, ARRAY['Notes'], w.w_start, w.w_end, 2.0 FROM seed_ids s, seed_week w
) x
WHERE employee_id IS NOT NULL
  AND project_id IS NOT NULL
  AND milestone_id IS NOT NULL
  AND activity_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM allocations a
    WHERE a.is_deleted = false
      AND a.employee_id = x.employee_id
      AND a.start_date <= (SELECT w_end FROM seed_week)
      AND a.end_date >= (SELECT w_start FROM seed_week)
  );

-- Confirmations: gap-fill only (preserve existing seed:last-2-weeks rows).
WITH days AS (
  SELECT d::date AS work_date
  FROM generate_series(
    (SELECT w_start FROM seed_week),
    (SELECT w_end FROM seed_week),
    INTERVAL '1 day'
  ) d
  WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
),
emps AS (
  SELECT id AS employee_id, hrms_id
  FROM employees
  WHERE is_deleted = false AND is_active = true
    AND hrms_id IN ('EMP-0001', 'EMP-0002', 'EMP-0004', 'EMP-TEST1', 'EMP-9999', 'EMP-1234')
),
to_confirm AS (
  SELECT e.employee_id, e.hrms_id, d.work_date
  FROM emps e
  CROSS JOIN days d
  WHERE NOT EXISTS (
    SELECT 1
    FROM work_confirmations wc
    WHERE wc.employee_id = e.employee_id
      AND wc.work_date = d.work_date
  )
),
ins AS (
  INSERT INTO work_confirmations (
    employee_id, work_date, submitted_at, is_missed_posting, miss_reason, has_deviation,
    is_active, is_deleted, created_at, modified_at, version
  )
  SELECT
    t.employee_id,
    t.work_date,
    (t.work_date + TIME '18:15') AT TIME ZONE 'Asia/Kolkata',
    (EXTRACT(ISODOW FROM t.work_date) = 5 AND t.hrms_id IN ('EMP-0004', 'EMP-9999')),
    CASE
      WHEN EXTRACT(ISODOW FROM t.work_date) = 5 AND t.hrms_id IN ('EMP-0004', 'EMP-9999')
      THEN 'Did not confirm by cutoff'
      ELSE NULL
    END,
    (EXTRACT(ISODOW FROM t.work_date) = 3
      AND NOT (EXTRACT(ISODOW FROM t.work_date) = 5 AND t.hrms_id IN ('EMP-0004', 'EMP-9999'))),
    true, false, NOW(), NOW(), 1
  FROM to_confirm t
  RETURNING id, employee_id, work_date, has_deviation, is_missed_posting
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
 AND i.work_date BETWEEN a.start_date AND a.end_date
JOIN projects p ON p.id = a.project_id
JOIN project_milestones pm ON pm.id = a.milestone_id
JOIN activities act ON act.id = a.activity_id
WHERE i.is_missed_posting = false;

-- Soft-delete prior active WCI rows for this week + seed cohort (then upsert revive).
UPDATE weekly_check_in_submissions s
SET
  is_deleted = true,
  is_active = false,
  deleted_at = NOW(),
  modified_at = NOW(),
  version = s.version + 1
WHERE s.week_start = (SELECT w_start FROM seed_week)
  AND s.is_deleted = false
  AND s.employee_id IN (
    SELECT id FROM employees
    WHERE is_deleted = false
      AND hrms_id IN ('EMP-0002', 'EMP-0004', 'EMP-TEST1', 'EMP-9999', 'EMP-1234')
  );

-- Weekly Check-In submissions (unique employee_id + week_start; revive on re-run).
WITH wci_rows AS (
  SELECT * FROM (VALUES
    -- digant (dept-1 comps), owner=anil
    (
      'EMP-0002'::text,
      'EMP-0001'::text,
      'EMP-0001'::text,
      'On Track'::text,
      'High'::text,
      'Appreciate'::text,
      'None'::text,
      NULL::text,
      $rmk$Seeded 2nd-last-week check-in for Digant: strong delivery on Amul UI and SkyView notes, confirmation discipline solid, minor Wednesday planning deviation noted and recovered next day without customer impact.$rmk$,
      '{"comp-dept-1-t-1":5,"comp-dept-1-t-2":4,"comp-dept-1-t-3":5,"comp-dept-1-t-4":4}'::jsonb,
      '{"comp-dept-1-b-1":5,"comp-dept-1-b-2":4,"comp-dept-1-b-3":5,"comp-dept-1-b-4":4}'::jsonb,
      jsonb_build_object(
        'projects', ARRAY['Amul', 'SkyView'],
        'capturedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'billablePct', 90,
        'nonBillablePct', 10,
        'utilizationHrs', 40,
        'planningAccuracy', 96,
        'noOperationalData', false,
        'confirmationDelayCount', 0,
        'confirmationDiscipline', 100,
        'planningDeviationCount', 1,
        'utilizationCapacityHrs', 43
      )
    ),
    -- amit (dept-3 comps), owner fallback anil
    (
      'EMP-0004',
      'EMP-0001',
      'EMP-0001',
      'Watch',
      'Medium',
      'None',
      'Coaching',
      'Align Friday confirmation cutoff habit',
      $rmk$Seeded 2nd-last-week check-in for Amit: design output on Amul was solid, but Friday confirmation was missed. Coaching on cutoff discipline and earlier escalation when design reviews overrun planned hours.$rmk$,
      '{"comp-dept-3-t-1":4,"comp-dept-3-t-2":3,"comp-dept-3-t-3":4,"comp-dept-3-t-4":4}'::jsonb,
      '{"comp-dept-3-b-1":4,"comp-dept-3-b-2":5,"comp-dept-3-b-3":4,"comp-dept-3-b-4":3}'::jsonb,
      jsonb_build_object(
        'projects', ARRAY['Amul'],
        'capturedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'billablePct', 78,
        'nonBillablePct', 22,
        'utilizationHrs', 25,
        'planningAccuracy', 88,
        'noOperationalData', false,
        'confirmationDelayCount', 1,
        'confirmationDiscipline', 80,
        'planningDeviationCount', 1,
        'utilizationCapacityHrs', 43
      )
    ),
    -- persist emp (dept-1), owner=digant
    (
      'EMP-TEST1',
      'EMP-0002',
      'EMP-0001',
      'On Track',
      'High',
      'Appreciate',
      'None',
      NULL,
      $rmk$Seeded 2nd-last-week check-in for Test Persist: consistent PR reviews on Persist Project, clean confirmation streak Mon–Fri, good collaboration with Digant on review turnaround.$rmk$,
      '{"comp-dept-1-t-1":4,"comp-dept-1-t-2":4,"comp-dept-1-t-3":3,"comp-dept-1-t-4":4}'::jsonb,
      '{"comp-dept-1-b-1":4,"comp-dept-1-b-2":5,"comp-dept-1-b-3":4,"comp-dept-1-b-4":4}'::jsonb,
      jsonb_build_object(
        'projects', ARRAY['Persist Project'],
        'capturedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'billablePct', 70,
        'nonBillablePct', 30,
        'utilizationHrs', 15,
        'planningAccuracy', 100,
        'noOperationalData', false,
        'confirmationDelayCount', 0,
        'confirmationDiscipline', 100,
        'planningDeviationCount', 0,
        'utilizationCapacityHrs', 43
      )
    ),
    -- test emp (dept-5), owner=digant
    (
      'EMP-9999',
      'EMP-0002',
      'EMP-0001',
      'Watch',
      'Medium',
      'None',
      'Training',
      'Support queue triage checklist',
      $rmk$Seeded 2nd-last-week check-in for Test Employee: support queue load was high on Persist Project; Friday confirmation missed. Training on triage checklist and earlier handoff when tickets spill past planned hours.$rmk$,
      '{"comp-dept-5-t-1":3,"comp-dept-5-t-2":4}'::jsonb,
      '{"comp-dept-5-b-1":4}'::jsonb,
      jsonb_build_object(
        'projects', ARRAY['Persist Project'],
        'capturedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'billablePct', 85,
        'nonBillablePct', 15,
        'utilizationHrs', 30,
        'planningAccuracy', 92,
        'noOperationalData', false,
        'confirmationDelayCount', 1,
        'confirmationDiscipline', 80,
        'planningDeviationCount', 1,
        'utilizationCapacityHrs', 43
      )
    ),
    -- ravi (dept-1), owner=digant
    (
      'EMP-1234',
      'EMP-0002',
      'EMP-0001',
      'On Track',
      'High',
      'Appreciate',
      'None',
      NULL,
      $rmk$Seeded 2nd-last-week check-in for Ravi: SkyView smoke tests completed on schedule with stable confirmation discipline across the week and useful defect notes for the next sprint.$rmk$,
      '{"comp-dept-1-t-1":4,"comp-dept-1-t-2":3,"comp-dept-1-t-3":4,"comp-dept-1-t-4":5}'::jsonb,
      '{"comp-dept-1-b-1":4,"comp-dept-1-b-2":4,"comp-dept-1-b-3":5,"comp-dept-1-b-4":4}'::jsonb,
      jsonb_build_object(
        'projects', ARRAY['SkyView'],
        'capturedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'billablePct', 72,
        'nonBillablePct', 28,
        'utilizationHrs', 25,
        'planningAccuracy', 98,
        'noOperationalData', false,
        'confirmationDelayCount', 0,
        'confirmationDiscipline', 100,
        'planningDeviationCount', 0,
        'utilizationCapacityHrs', 43
      )
    )
  ) AS v(
    emp_hrms, owner_hrms, submitter_hrms,
    weekly_status, confidence, recognition, action_type, action_notes,
    ro_remarks, technical_ratings, behavioural_ratings, evidence
  )
)
INSERT INTO weekly_check_in_submissions (
  employee_id, resource_owner_id, week_start, evidence,
  technical_ratings, behavioural_ratings, weekly_status, confidence,
  ro_remarks, action_type, action_notes, previous_action_status, recognition,
  submitted_at, submitted_by_id, action_outcome,
  is_active, is_deleted, deleted_at, created_at, modified_at, version
)
SELECT
  e.id,
  COALESCE(ro.id, anil.id),
  (SELECT w_start FROM seed_week),
  r.evidence,
  r.technical_ratings,
  r.behavioural_ratings,
  r.weekly_status,
  r.confidence,
  r.ro_remarks,
  r.action_type,
  r.action_notes,
  NULL,
  r.recognition,
  ((SELECT w_end FROM seed_week) + TIME '17:30') AT TIME ZONE 'Asia/Kolkata',
  sb.id,
  CASE WHEN r.action_type <> 'None' THEN 'Still Pending' ELSE NULL END,
  true, false, NULL, NOW(), NOW(), 1
FROM wci_rows r
JOIN employees e ON e.hrms_id = r.emp_hrms AND e.is_deleted = false
JOIN employees sb ON sb.hrms_id = r.submitter_hrms AND sb.is_deleted = false
LEFT JOIN employees ro ON ro.hrms_id = r.owner_hrms AND ro.is_deleted = false
CROSS JOIN LATERAL (
  SELECT id FROM employees WHERE hrms_id = 'EMP-0001' AND is_deleted = false LIMIT 1
) anil
ON CONFLICT (employee_id, week_start) DO UPDATE SET
  resource_owner_id = EXCLUDED.resource_owner_id,
  evidence = EXCLUDED.evidence,
  technical_ratings = EXCLUDED.technical_ratings,
  behavioural_ratings = EXCLUDED.behavioural_ratings,
  weekly_status = EXCLUDED.weekly_status,
  confidence = EXCLUDED.confidence,
  ro_remarks = EXCLUDED.ro_remarks,
  action_type = EXCLUDED.action_type,
  action_notes = EXCLUDED.action_notes,
  previous_action_status = EXCLUDED.previous_action_status,
  recognition = EXCLUDED.recognition,
  submitted_at = EXCLUDED.submitted_at,
  submitted_by_id = EXCLUDED.submitted_by_id,
  action_outcome = EXCLUDED.action_outcome,
  is_active = true,
  is_deleted = false,
  deleted_at = NULL,
  modified_at = NOW(),
  version = weekly_check_in_submissions.version + 1;

COMMIT;

SELECT 'week' AS k, w_start::text AS a, w_end::text AS b, '' AS c, '' AS d FROM seed_week;
SELECT 'allocations_week' AS k, count(*)::text, '' , '', ''
FROM allocations a
WHERE a.is_deleted = false
  AND a.start_date <= (SELECT w_end FROM seed_week)
  AND a.end_date >= (SELECT w_start FROM seed_week);
SELECT 'allocations_this_reason' AS k, count(*)::text, '', '', ''
FROM allocations
WHERE reason = 'seed:2nd-last-week-confirmation-wci' AND is_deleted = false;
SELECT 'confirmations' AS k, count(*)::text,
       count(*) FILTER (WHERE is_missed_posting)::text,
       count(*) FILTER (WHERE has_deviation)::text, ''
FROM work_confirmations
WHERE work_date BETWEEN (SELECT w_start FROM seed_week) AND (SELECT w_end FROM seed_week)
  AND is_deleted = false;
SELECT 'lines' AS k, count(*)::text, '', '', ''
FROM work_confirmation_lines wcl
JOIN work_confirmations wc ON wc.id = wcl.confirmation_id
WHERE wc.work_date BETWEEN (SELECT w_start FROM seed_week) AND (SELECT w_end FROM seed_week);
SELECT 'wci' AS k, count(*)::text, '', '', ''
FROM weekly_check_in_submissions
WHERE week_start = (SELECT w_start FROM seed_week) AND is_deleted = false;
