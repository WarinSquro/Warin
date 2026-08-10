-- Soft-delete duplicate activity names (keep lowest id), free unique name slot
UPDATE "activities" AS a
SET
  "is_deleted" = true,
  "is_active" = false,
  "status" = 'inactive'::"SetupStatus",
  "deleted_at" = CURRENT_TIMESTAMP,
  "name" = a."name" || ' (removed-' || a."id"::text || ')',
  "modified_at" = CURRENT_TIMESTAMP,
  "version" = a."version" + 1
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY LOWER("name") ORDER BY "id") AS rn
  FROM "activities"
  WHERE "is_deleted" = false
) d
WHERE a."id" = d."id" AND d.rn > 1;

CREATE UNIQUE INDEX "activities_name_key" ON "activities"("name");
