-- Employee ↔ Project eligibility for Work Allocation (Map Employees utility)
CREATE TABLE "employee_project_maps" (
    "employee_id" BIGINT NOT NULL,
    "project_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT,

    CONSTRAINT "employee_project_maps_pkey" PRIMARY KEY ("employee_id","project_id")
);

CREATE INDEX "employee_project_maps_project_id_idx" ON "employee_project_maps"("project_id");

ALTER TABLE "employee_project_maps" ADD CONSTRAINT "employee_project_maps_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_project_maps" ADD CONSTRAINT "employee_project_maps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
