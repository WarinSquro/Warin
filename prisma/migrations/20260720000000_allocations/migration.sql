-- Allocations (planner Integration phase)
CREATE TABLE "allocations" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "project_id" BIGINT NOT NULL,
    "milestone_id" BIGINT NOT NULL,
    "activity" TEXT NOT NULL,
    "tasks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "hours_per_day" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "allocations_employee_id_idx" ON "allocations"("employee_id");
CREATE INDEX "allocations_project_id_idx" ON "allocations"("project_id");
CREATE INDEX "allocations_milestone_id_idx" ON "allocations"("milestone_id");
CREATE INDEX "allocations_start_date_end_date_idx" ON "allocations"("start_date", "end_date");
CREATE INDEX "allocations_is_deleted_is_active_idx" ON "allocations"("is_deleted", "is_active");

ALTER TABLE "allocations" ADD CONSTRAINT "allocations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "project_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
