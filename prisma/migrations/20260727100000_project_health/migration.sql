-- AlterTable
CREATE TYPE "ProjectHealth" AS ENUM ('green', 'amber', 'red');

ALTER TABLE "projects" ADD COLUMN "health" "ProjectHealth" NOT NULL DEFAULT 'green';
ALTER TABLE "projects" ADD COLUMN "health_remarks" TEXT NOT NULL DEFAULT '';
