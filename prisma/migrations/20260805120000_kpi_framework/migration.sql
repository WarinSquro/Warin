-- CreateEnum
CREATE TYPE "AssessmentCycle" AS ENUM ('Q1', 'Q2', 'Q3', 'Q4');

-- CreateEnum
CREATE TYPE "KpiTargetDirection" AS ENUM ('higher_is_better', 'lower_is_better');

-- CreateEnum
CREATE TYPE "KpiRowStatus" AS ENUM ('draft', 'pending_result', 'completed');

-- CreateTable
CREATE TABLE "kpi_categories" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SetupStatus" NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "kpi_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_measurement_methods" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SetupStatus" NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "kpi_measurement_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_units_of_measurement" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SetupStatus" NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "kpi_units_of_measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_framework_items" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "calendar_year" INTEGER NOT NULL,
    "assessment_cycle" "AssessmentCycle" NOT NULL,
    "category_id" BIGINT NOT NULL,
    "kpi_name" TEXT NOT NULL,
    "measurement_method_id" BIGINT NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "target" DECIMAL(12,4) NOT NULL,
    "target_direction" "KpiTargetDirection" NOT NULL,
    "period_start_month" INTEGER NOT NULL,
    "period_end_month" INTEGER NOT NULL,
    "weightage" DECIMAL(6,2) NOT NULL,
    "status" "KpiRowStatus" NOT NULL DEFAULT 'draft',
    "kpi_result" DECIMAL(12,4),
    "kpi_score" DECIMAL(6,2),
    "remarks" TEXT,
    "attachment_key" TEXT,
    "attachment_name" TEXT,
    "attachment_mime" TEXT,
    "result_updated_at" TIMESTAMP(3),
    "result_updated_by_id" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "kpi_framework_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kpi_categories_code_key" ON "kpi_categories"("code");
CREATE UNIQUE INDEX "kpi_categories_name_key" ON "kpi_categories"("name");
CREATE INDEX "kpi_categories_is_deleted_is_active_idx" ON "kpi_categories"("is_deleted", "is_active");

CREATE UNIQUE INDEX "kpi_measurement_methods_code_key" ON "kpi_measurement_methods"("code");
CREATE UNIQUE INDEX "kpi_measurement_methods_name_key" ON "kpi_measurement_methods"("name");
CREATE INDEX "kpi_measurement_methods_is_deleted_is_active_idx" ON "kpi_measurement_methods"("is_deleted", "is_active");

CREATE UNIQUE INDEX "kpi_units_of_measurement_code_key" ON "kpi_units_of_measurement"("code");
CREATE UNIQUE INDEX "kpi_units_of_measurement_name_key" ON "kpi_units_of_measurement"("name");
CREATE INDEX "kpi_units_of_measurement_is_deleted_is_active_idx" ON "kpi_units_of_measurement"("is_deleted", "is_active");

CREATE INDEX "kpi_framework_items_employee_id_calendar_year_assessment_cy_idx" ON "kpi_framework_items"("employee_id", "calendar_year", "assessment_cycle");
CREATE INDEX "kpi_framework_items_status_idx" ON "kpi_framework_items"("status");
CREATE INDEX "kpi_framework_items_is_deleted_is_active_idx" ON "kpi_framework_items"("is_deleted", "is_active");

-- AddForeignKey
ALTER TABLE "kpi_framework_items" ADD CONSTRAINT "kpi_framework_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kpi_framework_items" ADD CONSTRAINT "kpi_framework_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "kpi_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpi_framework_items" ADD CONSTRAINT "kpi_framework_items_measurement_method_id_fkey" FOREIGN KEY ("measurement_method_id") REFERENCES "kpi_measurement_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpi_framework_items" ADD CONSTRAINT "kpi_framework_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "kpi_units_of_measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpi_framework_items" ADD CONSTRAINT "kpi_framework_items_result_updated_by_id_fkey" FOREIGN KEY ("result_updated_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default KPI masters (idempotent via ON CONFLICT)
INSERT INTO "kpi_categories" ("code", "name", "status", "is_active", "is_deleted", "modified_at", "version")
VALUES
  ('kcat-delivery', 'Delivery', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kcat-quality', 'Quality', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kcat-utilization', 'Utilization', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kcat-collaboration', 'Collaboration', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kcat-learning', 'Learning', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kcat-documentation', 'Documentation', 'active', true, false, CURRENT_TIMESTAMP, 1)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "kpi_measurement_methods" ("code", "name", "status", "is_active", "is_deleted", "modified_at", "version")
VALUES
  ('kmeth-system', 'System measured', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kmeth-manual', 'Manual assessment', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kmeth-client', 'Client feedback', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kmeth-peer', 'Peer review', 'active', true, false, CURRENT_TIMESTAMP, 1)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "kpi_units_of_measurement" ("code", "name", "status", "is_active", "is_deleted", "modified_at", "version")
VALUES
  ('kunit-pct', '%', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kunit-score', 'Score', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kunit-days', 'Days', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kunit-count', 'Count', 'active', true, false, CURRENT_TIMESTAMP, 1),
  ('kunit-hours', 'Hours', 'active', true, false, CURRENT_TIMESTAMP, 1)
ON CONFLICT ("code") DO NOTHING;
