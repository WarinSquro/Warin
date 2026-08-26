-- CreateEnum
CREATE TYPE "DecisionPointAllocationRequirement" AS ENUM ('optional', 'required');

-- CreateTable
CREATE TABLE "decision_point_types" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "allocation_requirement" "DecisionPointAllocationRequirement" NOT NULL DEFAULT 'optional',
    "status" "SetupStatus" NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "decision_point_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decision_point_types_code_key" ON "decision_point_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "decision_point_types_name_key" ON "decision_point_types"("name");

-- CreateIndex
CREATE INDEX "decision_point_types_is_deleted_is_active_idx" ON "decision_point_types"("is_deleted", "is_active");
