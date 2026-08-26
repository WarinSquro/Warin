-- CreateEnum
CREATE TYPE "DecisionPointStatus" AS ENUM (
  'pending_ro_action',
  'escalated_pending_next_ro',
  'acknowledged_closed',
  'approved_closed',
  'rejected_closed',
  'self_resolved_closed'
);

-- CreateEnum
CREATE TYPE "DecisionPointActionType" AS ENUM (
  'raised',
  'acknowledged_close',
  'approved_close',
  'rejected_close',
  'recommend_escalate',
  'self_resolved'
);

-- CreateTable
CREATE TABLE "id_sequences" (
    "name" TEXT NOT NULL,
    "next_value" BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT "id_sequences_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "decision_points" (
    "id" BIGSERIAL NOT NULL,
    "point_code" TEXT NOT NULL,
    "type_id" BIGINT NOT NULL,
    "subject" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,
    "status" "DecisionPointStatus" NOT NULL DEFAULT 'pending_ro_action',
    "raised_by_id" BIGINT NOT NULL,
    "current_owner_id" BIGINT,
    "immediate_owner_id" BIGINT NOT NULL,
    "previous_owner_id" BIGINT,
    "allocation_id" BIGINT,
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "last_action_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "final_actor_id" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "decision_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_point_actions" (
    "id" BIGSERIAL NOT NULL,
    "decision_point_id" BIGINT NOT NULL,
    "action_type" "DecisionPointActionType" NOT NULL,
    "performed_by_id" BIGINT NOT NULL,
    "remarks" TEXT NOT NULL,
    "previous_status" "DecisionPointStatus" NOT NULL,
    "new_status" "DecisionPointStatus" NOT NULL,
    "previous_owner_id" BIGINT,
    "next_owner_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_point_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decision_points_point_code_key" ON "decision_points"("point_code");

-- CreateIndex
CREATE INDEX "decision_points_raised_by_id_status_idx" ON "decision_points"("raised_by_id", "status");

-- CreateIndex
CREATE INDEX "decision_points_current_owner_id_status_idx" ON "decision_points"("current_owner_id", "status");

-- CreateIndex
CREATE INDEX "decision_points_type_id_idx" ON "decision_points"("type_id");

-- CreateIndex
CREATE INDEX "decision_points_is_deleted_is_active_idx" ON "decision_points"("is_deleted", "is_active");

-- CreateIndex
CREATE INDEX "decision_point_actions_decision_point_id_created_at_idx" ON "decision_point_actions"("decision_point_id", "created_at");

-- AddForeignKey
ALTER TABLE "decision_points" ADD CONSTRAINT "decision_points_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "decision_point_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "decision_points" ADD CONSTRAINT "decision_points_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "decision_points" ADD CONSTRAINT "decision_points_current_owner_id_fkey" FOREIGN KEY ("current_owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "decision_points" ADD CONSTRAINT "decision_points_immediate_owner_id_fkey" FOREIGN KEY ("immediate_owner_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "decision_points" ADD CONSTRAINT "decision_points_previous_owner_id_fkey" FOREIGN KEY ("previous_owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "decision_points" ADD CONSTRAINT "decision_points_final_actor_id_fkey" FOREIGN KEY ("final_actor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "decision_points" ADD CONSTRAINT "decision_points_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "decision_point_actions" ADD CONSTRAINT "decision_point_actions_decision_point_id_fkey" FOREIGN KEY ("decision_point_id") REFERENCES "decision_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "decision_point_actions" ADD CONSTRAINT "decision_point_actions_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "decision_point_actions" ADD CONSTRAINT "decision_point_actions_previous_owner_id_fkey" FOREIGN KEY ("previous_owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "decision_point_actions" ADD CONSTRAINT "decision_point_actions_next_owner_id_fkey" FOREIGN KEY ("next_owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
