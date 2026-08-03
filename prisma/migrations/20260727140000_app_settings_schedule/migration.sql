-- CreateEnum
CREATE TYPE "SettingsScheduleStatus" AS ENUM ('pending', 'applied', 'cancelled', 'superseded');

-- CreateTable
CREATE TABLE "app_settings_schedule" (
    "id" BIGSERIAL NOT NULL,
    "effective_date" DATE NOT NULL,
    "status" "SettingsScheduleStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "change_summary" TEXT NOT NULL,
    "created_by_id" BIGINT,
    "applied_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_settings_schedule_status_effective_date_idx" ON "app_settings_schedule"("status", "effective_date");

-- CreateIndex
CREATE INDEX "app_settings_schedule_created_by_id_idx" ON "app_settings_schedule"("created_by_id");

-- AddForeignKey
ALTER TABLE "app_settings_schedule" ADD CONSTRAINT "app_settings_schedule_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
