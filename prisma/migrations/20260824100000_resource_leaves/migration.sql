-- Resource Planner leave utility (Phase-1 FRD)
CREATE TYPE "ResourceLeaveType" AS ENUM ('planned', 'unplanned');
CREATE TYPE "ResourceLeaveClassification" AS ENUM ('negative', 'zero');
CREATE TYPE "ResourceLeaveStatus" AS ENUM ('active', 'cancelled');

CREATE TABLE "resource_leaves" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "leave_date" DATE NOT NULL,
    "leave_type" "ResourceLeaveType" NOT NULL,
    "classification" "ResourceLeaveClassification" NOT NULL,
    "reason" VARCHAR(30) NOT NULL,
    "impacted_planned_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ResourceLeaveStatus" NOT NULL DEFAULT 'active',
    "entered_by_employee_id" BIGINT NOT NULL,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "resource_leaves_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "resource_leaves_employee_id_leave_date_idx" ON "resource_leaves"("employee_id", "leave_date");
CREATE INDEX "resource_leaves_leave_date_idx" ON "resource_leaves"("leave_date");
CREATE INDEX "resource_leaves_status_idx" ON "resource_leaves"("status");
CREATE INDEX "resource_leaves_is_deleted_is_active_idx" ON "resource_leaves"("is_deleted", "is_active");

ALTER TABLE "resource_leaves" ADD CONSTRAINT "resource_leaves_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_leaves" ADD CONSTRAINT "resource_leaves_entered_by_employee_id_fkey" FOREIGN KEY ("entered_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
