-- Work confirmations (Integration phase)
CREATE TYPE "ConfirmationLineKind" AS ENUM ('planned', 'deviation', 'unplanned');

CREATE TABLE "work_confirmations" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "work_date" DATE NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "is_missed_posting" BOOLEAN NOT NULL DEFAULT false,
    "miss_reason" TEXT,
    "has_deviation" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "work_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_confirmations_employee_id_work_date_key" ON "work_confirmations"("employee_id", "work_date");
CREATE INDEX "work_confirmations_work_date_idx" ON "work_confirmations"("work_date");
CREATE INDEX "work_confirmations_is_deleted_is_active_idx" ON "work_confirmations"("is_deleted", "is_active");

ALTER TABLE "work_confirmations" ADD CONSTRAINT "work_confirmations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "work_confirmation_lines" (
    "id" BIGSERIAL NOT NULL,
    "confirmation_id" BIGINT NOT NULL,
    "allocation_id" BIGINT,
    "project_label" TEXT NOT NULL,
    "milestone_label" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "planned_hours" DOUBLE PRECISION NOT NULL,
    "actual_hours" DOUBLE PRECISION NOT NULL,
    "kind" "ConfirmationLineKind" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "tasks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_confirmation_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_confirmation_lines_confirmation_id_idx" ON "work_confirmation_lines"("confirmation_id");
CREATE INDEX "work_confirmation_lines_allocation_id_idx" ON "work_confirmation_lines"("allocation_id");

ALTER TABLE "work_confirmation_lines" ADD CONSTRAINT "work_confirmation_lines_confirmation_id_fkey" FOREIGN KEY ("confirmation_id") REFERENCES "work_confirmations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_confirmation_lines" ADD CONSTRAINT "work_confirmation_lines_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
