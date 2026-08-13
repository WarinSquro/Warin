-- Single active login session per employee: track session id + client metadata on refresh tokens.

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "active_session_id" TEXT;

ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "session_id" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip_address" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "device_label" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "browser_label" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill unique session ids for any pre-existing refresh rows.
UPDATE "refresh_tokens"
SET "session_id" = replace(gen_random_uuid()::text, '-', '')
WHERE "session_id" IS NULL;

ALTER TABLE "refresh_tokens" ALTER COLUMN "session_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");
CREATE INDEX IF NOT EXISTS "refresh_tokens_employee_id_revoked_at_idx" ON "refresh_tokens"("employee_id", "revoked_at");

-- Force re-login after deploy: revoke lingering multi-sessions and clear active pointer.
UPDATE "refresh_tokens" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "revoked_at" IS NULL;
UPDATE "employees" SET "active_session_id" = NULL WHERE "active_session_id" IS NOT NULL;
