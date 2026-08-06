-- AlterTable app_settings: global date display format
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "date_format" TEXT NOT NULL DEFAULT 'dd/MM/yyyy';
