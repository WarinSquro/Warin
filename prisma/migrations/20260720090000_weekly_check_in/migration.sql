-- Weekly check-in persistence
CREATE TYPE "CompetencyKind" AS ENUM ('technical', 'behavioural');

CREATE TABLE "weekly_check_in_settings" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL DEFAULT 'default',
    "ranking_levels" JSONB NOT NULL,
    "action_types" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "weekly_check_in_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_check_in_settings_code_key" ON "weekly_check_in_settings"("code");

CREATE TABLE "weekly_check_in_competencies" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "department_code" TEXT NOT NULL,
    "kind" "CompetencyKind" NOT NULL,
    "label" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "weekly_check_in_competencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_check_in_competencies_code_key" ON "weekly_check_in_competencies"("code");
CREATE INDEX "weekly_check_in_competencies_department_code_is_deleted_idx" ON "weekly_check_in_competencies"("department_code", "is_deleted");

CREATE TABLE "weekly_check_in_submissions" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "resource_owner_id" BIGINT NOT NULL,
    "week_start" DATE NOT NULL,
    "evidence" JSONB NOT NULL,
    "technical_ratings" JSONB NOT NULL,
    "behavioural_ratings" JSONB NOT NULL,
    "weekly_status" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "ro_remarks" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "action_notes" TEXT,
    "previous_action_status" TEXT,
    "recognition" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "submitted_by_id" BIGINT NOT NULL,
    "action_outcome" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "weekly_check_in_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_check_in_submissions_employee_id_week_start_key" ON "weekly_check_in_submissions"("employee_id", "week_start");
CREATE INDEX "weekly_check_in_submissions_resource_owner_id_week_start_idx" ON "weekly_check_in_submissions"("resource_owner_id", "week_start");
CREATE INDEX "weekly_check_in_submissions_week_start_idx" ON "weekly_check_in_submissions"("week_start");
CREATE INDEX "weekly_check_in_submissions_is_deleted_is_active_idx" ON "weekly_check_in_submissions"("is_deleted", "is_active");

ALTER TABLE "weekly_check_in_submissions" ADD CONSTRAINT "weekly_check_in_submissions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_check_in_submissions" ADD CONSTRAINT "weekly_check_in_submissions_resource_owner_id_fkey" FOREIGN KEY ("resource_owner_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_check_in_submissions" ADD CONSTRAINT "weekly_check_in_submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
