-- AlterTable employees: first-login PIN change flag
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "must_change_pin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "first_login_completed_at" TIMESTAMP(3);

-- AlterTable smtp_settings: require successful connection test for welcome emails
ALTER TABLE "smtp_settings" ADD COLUMN IF NOT EXISTS "connection_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "smtp_settings" ADD COLUMN IF NOT EXISTS "last_connection_test_at" TIMESTAMP(3);

-- CreateTable welcome_pin_email_logs (no plaintext PIN)
CREATE TABLE IF NOT EXISTS "welcome_pin_email_logs" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "to_email" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welcome_pin_email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "welcome_pin_email_logs_employee_id_idx" ON "welcome_pin_email_logs"("employee_id");
CREATE INDEX IF NOT EXISTS "welcome_pin_email_logs_created_at_idx" ON "welcome_pin_email_logs"("created_at");

DO $$ BEGIN
  ALTER TABLE "welcome_pin_email_logs"
    ADD CONSTRAINT "welcome_pin_email_logs_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
