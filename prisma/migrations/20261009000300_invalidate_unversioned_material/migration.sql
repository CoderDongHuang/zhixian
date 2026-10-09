-- Historical results have no frozen input manifest, so their freshness cannot be proven.
UPDATE "Analysis" SET status = 'STALE' WHERE "inputManifest" IS NULL;
DELETE FROM "Embedding" WHERE "documentId" IS NOT NULL;
