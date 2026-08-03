-- Skill categories master + skills.category (text) → category_id (PK FK)

CREATE TABLE "skill_categories" (
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

    CONSTRAINT "skill_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "skill_categories_code_key" ON "skill_categories"("code");
CREATE UNIQUE INDEX "skill_categories_name_key" ON "skill_categories"("name");
CREATE INDEX "skill_categories_is_deleted_is_active_idx" ON "skill_categories"("is_deleted", "is_active");

-- Seed defaults + any distinct category labels already on skills
INSERT INTO "skill_categories" ("code", "name", "status", "is_active", "is_deleted", "modified_at", "version")
SELECT
  'scat-' || lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '-', 'g')),
  c.name,
  'active',
  true,
  false,
  CURRENT_TIMESTAMP,
  1
FROM (
  SELECT unnest(ARRAY[
    'Frontend', 'Backend', 'QA', 'Design', 'DevOps', 'Other'
  ]) AS name
  UNION
  SELECT DISTINCT trim(category) AS name
  FROM skills
  WHERE category IS NOT NULL AND trim(category) <> ''
) c
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "skills" ADD COLUMN "category_id" BIGINT;

UPDATE "skills" s
SET "category_id" = sc.id
FROM "skill_categories" sc
WHERE sc.name = trim(s.category)
  AND sc.is_deleted = false;

-- Safety: any unmatched → Other
UPDATE "skills" s
SET "category_id" = (SELECT id FROM "skill_categories" WHERE name = 'Other' LIMIT 1)
WHERE s.category_id IS NULL;

ALTER TABLE "skills" ALTER COLUMN "category_id" SET NOT NULL;
ALTER TABLE "skills" DROP COLUMN "category";

ALTER TABLE "skills"
  ADD CONSTRAINT "skills_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "skill_categories"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "skills_category_id_idx" ON "skills"("category_id");
