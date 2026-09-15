-- Focus timer check-in: interval minutes (0 = disabled). Response timeout is app-fixed at 30s.
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "focus_check_in_minutes" INTEGER NOT NULL DEFAULT 0;
