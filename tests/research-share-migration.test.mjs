import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const database = process.env.DATABASE_URL;
const isolated = database && /^zhixian_.*(?:test|e2e)$/.test(new URL(database).pathname.slice(1));
test("duplicate share migration retains every historical snapshot and audit mapping", { skip: !isolated }, async () => {
  const client = new pg.Client({ connectionString: database });
  const schema = `share_test_${randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`);
    await client.query('CREATE TABLE "ResearchShare" (id text PRIMARY KEY, "collectionId" text, version integer, snapshot jsonb, "createdAt" timestamp)');
    await client.query(`INSERT INTO "ResearchShare" VALUES ('a','c',1,'{"version":1,"title":"old-a"}', '2020-01-01'), ('b','c',1,'{"version":1,"title":"old-b"}', '2020-01-02'), ('c','c',2,'{"version":2}', '2020-01-03'), ('d','c',2,'{"version":2,"title":"old-d"}', '2020-01-04')`);
    const before = (await client.query('SELECT id, snapshot FROM "ResearchShare" ORDER BY id')).rows;
    await client.query(await readFile(new URL("../prisma/migrations/20261009000900_research_share_versions/migration.sql", import.meta.url), "utf8"));
    assert.deepEqual((await client.query('SELECT id, snapshot FROM "ResearchShare" ORDER BY id')).rows, before);
    const after = (await client.query('SELECT version, "legacyVersion" FROM "ResearchShare" ORDER BY id')).rows;
    assert.deepEqual(after, [{ version: 1, legacyVersion: null }, { version: 3, legacyVersion: 1 }, { version: 2, legacyVersion: null }, { version: 4, legacyVersion: 2 }]);
  } finally { await client.query(`DROP SCHEMA "${schema}" CASCADE`); await client.end(); }
});
