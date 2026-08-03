-- CreateTable
CREATE TABLE "customers" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SetupStatus" NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_name_key" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_is_deleted_is_active_idx" ON "customers"("is_deleted", "is_active");

-- Seed default customers used by Projects Add/Edit dropdown (idempotent for empty table)
INSERT INTO "customers" ("code", "name", "status", "is_active", "is_deleted", "created_at", "modified_at", "version")
VALUES
  ('cust-1', 'Northwind Inc.', 'active', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('cust-2', 'Contoso Ltd.', 'active', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('cust-3', 'Globex Corp.', 'active', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('cust-4', 'Initech', 'active', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('cust-5', 'Umbrella Co.', 'active', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('cust-6', 'In-house', 'active', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('cust-7', 'Amul', 'active', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
ON CONFLICT ("name") DO NOTHING;
