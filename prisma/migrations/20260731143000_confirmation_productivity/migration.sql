-- Confirmation productivity evidence (workday timeline + focus timers)
CREATE TABLE "confirmation_productivity_days" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "work_date" DATE NOT NULL,
    "day_start_at" TIMESTAMP(3),
    "lunch_out_at" TIMESTAMP(3),
    "lunch_in_at" TIMESTAMP(3),
    "day_end_at" TIMESTAMP(3),
    "work_hours_snapshot" DOUBLE PRECISION,
    "active_allocation_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "confirmation_productivity_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "confirmation_productivity_days_employee_id_work_date_key"
  ON "confirmation_productivity_days"("employee_id", "work_date");
CREATE INDEX "confirmation_productivity_days_work_date_idx"
  ON "confirmation_productivity_days"("work_date");
CREATE INDEX "confirmation_productivity_days_is_deleted_is_active_idx"
  ON "confirmation_productivity_days"("is_deleted", "is_active");

ALTER TABLE "confirmation_productivity_days"
  ADD CONSTRAINT "confirmation_productivity_days_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "confirmation_focus_sessions" (
    "id" BIGSERIAL NOT NULL,
    "day_id" BIGINT NOT NULL,
    "allocation_id" BIGINT,
    "allocation_key" TEXT NOT NULL,
    "session_accum_ms" INTEGER NOT NULL DEFAULT 0,
    "segment_started_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "confirmation_focus_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "confirmation_focus_sessions_day_id_allocation_key_key"
  ON "confirmation_focus_sessions"("day_id", "allocation_key");
CREATE INDEX "confirmation_focus_sessions_day_id_idx"
  ON "confirmation_focus_sessions"("day_id");
CREATE INDEX "confirmation_focus_sessions_allocation_id_idx"
  ON "confirmation_focus_sessions"("allocation_id");

ALTER TABLE "confirmation_focus_sessions"
  ADD CONSTRAINT "confirmation_focus_sessions_day_id_fkey"
  FOREIGN KEY ("day_id") REFERENCES "confirmation_productivity_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "confirmation_focus_sessions"
  ADD CONSTRAINT "confirmation_focus_sessions_allocation_id_fkey"
  FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "confirmation_focus_laps" (
    "id" BIGSERIAL NOT NULL,
    "day_id" BIGINT NOT NULL,
    "allocation_id" BIGINT,
    "allocation_key" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confirmation_focus_laps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "confirmation_focus_laps_day_id_allocation_key_idx"
  ON "confirmation_focus_laps"("day_id", "allocation_key");
CREATE INDEX "confirmation_focus_laps_allocation_id_idx"
  ON "confirmation_focus_laps"("allocation_id");

ALTER TABLE "confirmation_focus_laps"
  ADD CONSTRAINT "confirmation_focus_laps_day_id_fkey"
  FOREIGN KEY ("day_id") REFERENCES "confirmation_productivity_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "confirmation_focus_laps"
  ADD CONSTRAINT "confirmation_focus_laps_allocation_id_fkey"
  FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
