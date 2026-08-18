-- Optional per-employee login IP restriction. NULL = no restriction (existing rows unchanged).
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "allowed_ip" VARCHAR(45);
