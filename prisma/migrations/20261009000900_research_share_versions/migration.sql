ALTER TABLE "ResearchShare" ADD COLUMN "legacyVersion" INTEGER;

-- Keep the first allocation and frozen JSON intact; retain an audit mapping for duplicates.
WITH ranked AS (
  SELECT id, "collectionId", version,
    row_number() OVER (PARTITION BY "collectionId", version ORDER BY "createdAt", id) AS duplicate,
    max(version) OVER (PARTITION BY "collectionId") AS maximum
  FROM "ResearchShare"
), duplicates AS (
  SELECT id, version, maximum + row_number() OVER (PARTITION BY "collectionId" ORDER BY version, id) AS replacement
  FROM ranked WHERE duplicate > 1
)
UPDATE "ResearchShare" s SET "legacyVersion" = d.version, version = d.replacement
FROM duplicates d WHERE s.id = d.id;

CREATE UNIQUE INDEX "ResearchShare_collectionId_version_key" ON "ResearchShare"("collectionId", version);
