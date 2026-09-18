-- Allow comma-separated Allowed IPs (multiple IPv4 / IPv6).
ALTER TABLE "employees"
  ALTER COLUMN "allowed_ip" TYPE VARCHAR(255);
