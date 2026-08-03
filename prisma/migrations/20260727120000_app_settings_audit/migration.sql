-- CreateTable
CREATE TABLE "app_settings_audit" (
    "id" BIGSERIAL NOT NULL,
    "what" TEXT NOT NULL,
    "who_name" TEXT NOT NULL,
    "employee_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_settings_audit_created_at_idx" ON "app_settings_audit"("created_at");

-- CreateIndex
CREATE INDEX "app_settings_audit_employee_id_idx" ON "app_settings_audit"("employee_id");

-- AddForeignKey
ALTER TABLE "app_settings_audit" ADD CONSTRAINT "app_settings_audit_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
