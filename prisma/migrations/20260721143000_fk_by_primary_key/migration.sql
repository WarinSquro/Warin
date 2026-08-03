-- FK-by-PK: replace text/code references with BIGINT primary-key foreign keys.
-- 1) weekly_check_in_competencies.department_code → department_id
-- 2) projects.customer (name) → customer_id
-- 3) allocations.activity (name) → activity_id

-- ─── weekly_check_in_competencies ───────────────────────────────────────────
ALTER TABLE "weekly_check_in_competencies" ADD COLUMN "department_id" BIGINT;

UPDATE "weekly_check_in_competencies" w
SET "department_id" = d."id"
FROM "departments" d
WHERE d."code" = w."department_code"
   OR d."id"::text = w."department_code";

-- Orphan rows: cannot map code → drop soft-deleted orphans; fail hard on active
DELETE FROM "weekly_check_in_competencies"
WHERE "department_id" IS NULL AND "is_deleted" = true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "weekly_check_in_competencies" WHERE "department_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'weekly_check_in_competencies: unmapped department_code values remain';
  END IF;
END $$;

ALTER TABLE "weekly_check_in_competencies" ALTER COLUMN "department_id" SET NOT NULL;

DROP INDEX IF EXISTS "weekly_check_in_competencies_department_code_is_deleted_idx";
ALTER TABLE "weekly_check_in_competencies" DROP COLUMN "department_code";

CREATE INDEX "weekly_check_in_competencies_department_id_is_deleted_idx"
  ON "weekly_check_in_competencies"("department_id", "is_deleted");

ALTER TABLE "weekly_check_in_competencies"
  ADD CONSTRAINT "weekly_check_in_competencies_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── projects.customer → customer_id ────────────────────────────────────────
ALTER TABLE "projects" ADD COLUMN "customer_id" BIGINT;

-- Exact name match
UPDATE "projects" p
SET "customer_id" = c."id"
FROM "customers" c
WHERE c."is_deleted" = false
  AND c."name" = p."customer"
  AND p."customer_id" IS NULL;

-- Create missing customers from distinct project customer names still unmatched
INSERT INTO "customers" ("code", "name", "status", "is_active", "is_deleted", "created_at", "modified_at", "version")
SELECT
  'cust-mig-' || substr(md5(p."customer"), 1, 12),
  p."customer",
  'active',
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  1
FROM (
  SELECT DISTINCT "customer" AS "customer"
  FROM "projects"
  WHERE "customer_id" IS NULL AND TRIM("customer") <> ''
) p
WHERE NOT EXISTS (
  SELECT 1 FROM "customers" c WHERE c."name" = p."customer" AND c."is_deleted" = false
);

UPDATE "projects" p
SET "customer_id" = c."id"
FROM "customers" c
WHERE c."is_deleted" = false
  AND c."name" = p."customer"
  AND p."customer_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "projects" WHERE "customer_id" IS NULL) THEN
    RAISE EXCEPTION 'projects: unmapped customer name values remain';
  END IF;
END $$;

ALTER TABLE "projects" ALTER COLUMN "customer_id" SET NOT NULL;
ALTER TABLE "projects" DROP COLUMN "customer";

CREATE INDEX "projects_customer_id_idx" ON "projects"("customer_id");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── allocations.activity → activity_id ─────────────────────────────────────
ALTER TABLE "allocations" ADD COLUMN "activity_id" BIGINT;

UPDATE "allocations" a
SET "activity_id" = act."id"
FROM "activities" act
WHERE act."is_deleted" = false
  AND (act."name" = a."activity" OR act."code" = a."activity")
  AND a."activity_id" IS NULL;

-- Soft-deleted allocations with no match: pick any active activity as placeholder then leave deleted
UPDATE "allocations" a
SET "activity_id" = (
  SELECT act."id" FROM "activities" act WHERE act."is_deleted" = false ORDER BY act."id" LIMIT 1
)
WHERE a."activity_id" IS NULL AND a."is_deleted" = true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "allocations" WHERE "activity_id" IS NULL) THEN
    RAISE EXCEPTION 'allocations: unmapped activity text values remain';
  END IF;
END $$;

-- If table is empty, still need a NOT NULL column — allow empty table with no rows
-- (DO block above passes). For brand-new empty DB this is fine.
ALTER TABLE "allocations" ALTER COLUMN "activity_id" SET NOT NULL;
ALTER TABLE "allocations" DROP COLUMN "activity";

CREATE INDEX "allocations_activity_id_idx" ON "allocations"("activity_id");

ALTER TABLE "allocations"
  ADD CONSTRAINT "allocations_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "activities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
