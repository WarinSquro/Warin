-- Allow the same activity name under different milestones (project types).
DROP INDEX IF EXISTS "activities_name_key";

CREATE UNIQUE INDEX "activities_name_activity_milestone_id_key"
  ON "activities"("name", "activity_milestone_id");
