ALTER TABLE "LearningTask" ADD COLUMN "dayKey" TEXT, ADD COLUMN "dayTimezone" TEXT;

-- Preserve historical duplicates, but only one task owns each daily identity.
WITH dated AS (
  SELECT t."id", t."userId", t."pathId",
    to_char(t."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE
      CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p."timezone") THEN p."timezone" ELSE 'Asia/Shanghai' END, 'YYYY-MM-DD') AS day,
    CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p."timezone") THEN p."timezone" ELSE 'Asia/Shanghai' END AS zone
  FROM "LearningTask" t LEFT JOIN "UserPreference" p ON p."userId" = t."userId"
  WHERE t."taskType" <> 'REVIEW' AND t."pathId" IS NOT NULL
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY "userId", "pathId", day ORDER BY "id") AS rank FROM dated
)
UPDATE "LearningTask" t SET "dayKey" = r.day, "dayTimezone" = r.zone FROM ranked r WHERE t."id" = r."id" AND r.rank = 1;

CREATE UNIQUE INDEX "LearningTask_userId_pathId_dayKey_key" ON "LearningTask"("userId", "pathId", "dayKey");

WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "userId" ORDER BY "updatedAt" DESC, "id" DESC) AS rank FROM "LearningPath" WHERE "active"
)
UPDATE "LearningPath" p SET "active" = false FROM ranked r WHERE p."id" = r."id" AND r.rank > 1;
CREATE UNIQUE INDEX "LearningPath_one_active_per_user" ON "LearningPath"("userId") WHERE "active";
