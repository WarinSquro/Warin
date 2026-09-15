-- AlterTable
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "joining_date" DATE,
ADD COLUMN IF NOT EXISTS "exit_date" DATE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "employee_costs" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "cost_per_minute" DECIMAL(14,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "status" "SetupStatus" NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "employee_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "employee_costs_employee_id_effective_from_idx" ON "employee_costs"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "employee_costs_is_deleted_is_active_idx" ON "employee_costs"("is_deleted", "is_active");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "employee_costs" ADD CONSTRAINT "employee_costs_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
