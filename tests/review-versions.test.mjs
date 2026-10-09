import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { saveCurrentAnalysis } from "../scripts/analysis-storage.mjs";

const isolated = process.env.DATABASE_URL && /^zhixian_.*(?:test|e2e)$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1));
test("review command preserves history and uses the initial publication policy", { skip: !isolated }, async () => {
  const db = new PrismaClient();
  const prefix = `review-${randomUUID()}`;
  const quote = "原文提供可以定位的独立证据";
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    const content = input.messages.map((item) => item.content).join(" ");
    const evidence = content.includes("no-evidence") ? [] : [{ quote, stance: content.includes("conflict-case") ? "CONFLICT" : "SUPPORT" }];
    const value = input.model === "verify" ? { factuality: 1, relevance: 1, completeness: 1, unsupportedClaims: [] } : { summary: "new version", evidence, facts: [quote], importance: 0.8 };
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const load = (id) => db.event.findUniqueOrThrow({ where: { id }, include: { documents: { include: { document: { include: { source: true } } } } } });
  const originals = [];
  try {
    for (const kind of ["trusted", "community", "conflict-case", "no-evidence", "race"]) {
      const id = `${prefix}-${kind}`;
      await db.source.create({ data: { id, name: id, url: "https://example.com", type: kind === "community" ? "HACKER_NEWS" : "OFFICIAL_BLOG", language: "ZH", trustScore: 1 } });
      await db.rawDocument.create({ data: { id, sourceId: id, url: `https://example.com/${id}`, title: kind, content: quote, contentHash: id, language: "ZH", processingStatus: "PROCESSED" } });
      await db.event.create({ data: { id, title: kind, type: "TEST", clusterKey: id, documents: { create: { documentId: id } } } });
      originals.push(await saveCurrentAnalysis(db, await load(id), { summary: `old ${kind}`, confidence: 0.5, status: "PENDING_REVIEW", modelVersion: "old" }, [{ quote, stance: "CONTEXT" }], 0.5));
    }
    const race = originals.pop();
    const event = await load(race.eventId);
    const data = { summary: "race result", confidence: 0.9, status: "AUTO_PUBLISHED", modelVersion: "test" };
    const winners = await Promise.all([1, 2].map(() => saveCurrentAnalysis(db, event, data, [{ quote, stance: "SUPPORT" }], 0.8, race.id)));
    assert.equal(winners.filter(Boolean).length, 1);
    const run = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["scripts/auto-resolve-reviews.mjs"], { env: { ...process.env, AI_API_KEY: "local", AI_API_URL: url, AI_MODEL: "verify", ANALYSIS_AI_API_KEY: "local", ANALYSIS_AI_API_URL: url, ANALYSIS_AI_MODEL: "edit", REVIEW_BATCH_SIZE: "100" } });
      let output = ""; child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; }); child.on("error", reject); child.on("exit", (code) => resolve({ code, output }));
    });
    assert.equal(run.code, 0, run.output);
    for (const old of originals) {
      const unchanged = await db.analysis.findUniqueOrThrow({ where: { id: old.id }, include: { evidence: true } });
      assert.equal(unchanged.summary, old.summary); assert.equal(unchanged.analyzedAt.getTime(), old.analyzedAt.getTime());
      assert.equal(unchanged.evidence[0].stance, "CONTEXT");
      const latest = await db.analysis.findFirstOrThrow({ where: { eventId: old.eventId }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }], include: { evidence: true } });
      assert.notEqual(latest.id, old.id); assert.ok(latest.analyzedAt > old.analyzedAt);
      assert.equal(JSON.parse(latest.verificationNotes).replacesAnalysisId, old.id);
      const allowed = old.eventId.endsWith("-trusted");
      assert.equal(latest.status, allowed ? "AUTO_PUBLISHED" : "REJECTED");
      assert.equal((await load(old.eventId)).isPublic, allowed);
      assert.equal(latest.evidence.length, old.eventId.endsWith("-no-evidence") ? 0 : 1);
      if (allowed) assert.equal(latest.evidence[0].stance, "SUPPORT");
    }
  } finally {
    await db.event.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.rawDocument.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.source.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.$disconnect(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
