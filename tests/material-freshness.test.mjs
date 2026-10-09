import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { saveCurrentAnalysis } from "../scripts/analysis-storage.mjs";

const database = process.env.DATABASE_URL;
const isolated = database && /^zhixian_.*(?:test|e2e)$/.test(new URL(database).pathname.slice(1));

test("material freshness across processing, analysis and vector pipelines", { skip: !isolated }, async (t) => {
  const db = new PrismaClient();
  const prefix = `freshness-${randomUUID()}`;
  const title = `材料更新回归测试原文证据可信研究工作台完整链路版本检查与重新生成${prefix}`;
  let hook = async () => {};
  let failModel = false;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    await hook(request);
    if (failModel) { res.writeHead(503); res.end(JSON.stringify({ error: { message: "test outage" } })); return; }
    const result = request.input ? { data: [{ embedding: Array(1024).fill(0.01) }] } : {
      choices: [{ message: { content: JSON.stringify(request.model === "verify" ? {
        factuality: 1, relevance: 1, completeness: 1, unsupportedClaims: [], notes: "test",
      } : { summary: "test analysis", facts: ["测试原文第二版本"], evidence: [{ quote: "测试原文第二版本", stance: "SUPPORT" }], importance: 0.7 }) } }],
    };
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(result));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const run = (script, extra = {}) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`scripts/${script}.mjs`], { env: {
      ...process.env, AI_API_KEY: "test", AI_API_URL: url, AI_MODEL: "primary",
      ANALYSIS_AI_API_KEY: "test", ANALYSIS_AI_API_URL: url, ANALYSIS_AI_MODEL: "verify",
      EMBEDDING_API_KEY: "test", EMBEDDING_API_URL: url, EMBEDDING_MODEL: "test-vector", ...extra,
    } });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject); child.on("exit", (code) => resolve({ code, output }));
  });
  const load = (id) => db.event.findUniqueOrThrow({ where: { id }, include: { documents: { include: { document: { include: { source: true } } } } } });
  const data = { summary: "original", confidence: 0.9, status: "AUTO_PUBLISHED", modelVersion: "test" };
  try {
    const source = await db.source.create({ data: { id: prefix, name: prefix, url: "https://example.com", type: "OFFICIAL_BLOG", language: "ZH", trustScore: 1 } });
    const doc = await db.rawDocument.create({ data: { id: prefix, sourceId: source.id, url: `https://example.com/${prefix}`, title, content: "测试原文第一版本", contentHash: "first", language: "ZH", processingStatus: "PROCESSED" } });
    const event = await db.event.create({ data: { id: prefix, title, clusterKey: prefix, type: "TEST", documents: { create: { documentId: doc.id } } } });
    const original = await saveCurrentAnalysis(db, await load(event.id), data, [{ quote: "测试原文第一版本", stance: "SUPPORT" }], 0.7);
    const feed = await db.feedItem.findFirstOrThrow({ where: { eventId: event.id } });
    const user = await db.user.create({ data: { id: prefix } });
    await db.bookmark.create({ data: { userId: user.id, feedItemId: feed.id } });
    await db.$executeRaw`INSERT INTO "Embedding" (id, "documentId", "contentHash", model, dimensions, vector, "createdAt") VALUES (${prefix}, ${doc.id}, ${prefix}, 'test-vector', 1024, ${`[${Array(1024).fill(0.01).join(",")}]`}::vector, now())`;

    await t.test("same URL correction invalidates analysis and vector without deleting bookmarks", async () => {
      await db.rawDocument.update({ where: { id: doc.id }, data: { content: "测试原文第二版本", contentHash: "second", cleanedContent: null, processingStatus: "PENDING" } });
      assert.equal((await db.analysis.findUniqueOrThrow({ where: { id: original.id } })).status, "STALE");
      assert.equal(await db.embedding.count({ where: { documentId: doc.id } }), 0);
      assert.equal(await db.bookmark.count({ where: { userId: user.id } }), 1);
      assert.equal((await db.analysis.update({ where: { id: original.id }, data: { status: "AUTO_PUBLISHED" } })).status, "STALE");
    });
    await t.test("real processing and analysis commands regenerate frozen evidence atomically", async () => {
      const processed = await run("process-documents", { AI_API_KEY: "" }); assert.equal(processed.code, 0, processed.output);
      const freshEvent = (await db.eventDocument.findFirstOrThrow({ where: { documentId: doc.id } })).eventId;
      const analyzed = await run("analyze-events"); assert.equal(analyzed.code, 0, analyzed.output);
      const current = await db.analysis.findFirstOrThrow({ where: { eventId: freshEvent, status: "AUTO_PUBLISHED" }, include: { evidence: true } });
      assert.equal(current.inputRevision, (await load(freshEvent)).materialRevision);
      assert.equal(current.inputManifest[0].content, "测试原文第二版本");
      assert.equal(current.evidence[0].quote, "测试原文第二版本");
      const embedded = await run("embed-documents"); assert.equal(embedded.code, 0, embedded.output);
      assert.equal(await db.embedding.count({ where: { documentId: doc.id, model: "test-vector" } }), 1);
      const newModel = await run("embed-documents", { EMBEDDING_MODEL: "new-model" }); assert.equal(newModel.code, 0, newModel.output);
      assert.equal(await db.embedding.count({ where: { documentId: doc.id, model: "new-model" } }), 1);
    });
    await t.test("new materials and moving a document invalidate both old and new event versions", async () => {
      const oldId = (await db.eventDocument.findFirstOrThrow({ where: { documentId: doc.id } })).eventId;
      const before = await load(oldId);
      const next = await db.event.create({ data: { id: `${prefix}-next`, title: prefix, clusterKey: `${prefix}-next`, type: "TEST" } });
      await db.eventDocument.update({ where: { eventId_documentId: { eventId: oldId, documentId: doc.id } }, data: { eventId: next.id } });
      assert.equal((await load(oldId)).materialRevision, before.materialRevision + 1);
      assert.equal(await db.analysis.count({ where: { eventId: oldId, status: "AUTO_PUBLISHED" } }), 0);
      assert.equal((await load(next.id)).materialRevision, 1);
      assert.equal(await saveCurrentAnalysis(db, before, data, [], 0.7), null);
    });
    await t.test("slow model result and stale vector cannot be installed after a newer correction", async () => {
      let calls = 0;
      hook = async () => { if (calls++ === 0) await db.rawDocument.update({ where: { id: doc.id }, data: { contentHash: "third", content: "测试原文第三版本", processingStatus: "PENDING" } }); };
      const analyzed = await run("analyze-events"); assert.equal(analyzed.code, 0, analyzed.output);
      assert.equal(await db.analysis.count({ where: { eventId: `${prefix}-next`, status: "AUTO_PUBLISHED" } }), 0);
      await db.rawDocument.update({ where: { id: doc.id }, data: { processingStatus: "PROCESSED" } });
      calls = 0; hook = async () => { if (calls++ === 0) await db.rawDocument.update({ where: { id: doc.id }, data: { contentHash: "fourth", content: "测试原文第四版本", processingStatus: "PENDING" } }); };
      const embedded = await run("embed-documents", { EMBEDDING_MODEL: "slow-model" }); assert.equal(embedded.code, 0, embedded.output);
      assert.equal(await db.embedding.count({ where: { documentId: doc.id } }), 0);
      hook = async () => {}; failModel = true;
      await db.rawDocument.update({ where: { id: doc.id }, data: { processingStatus: "PROCESSED" } });
      const failed = await run("analyze-events"); assert.equal(failed.code, 1, failed.output);
      assert.equal(await db.analysis.count({ where: { eventId: `${prefix}-next`, status: "AUTO_PUBLISHED" } }), 0);
    });
    await t.test("two workers for the same frozen event create only one current analysis", async () => {
      const frozen = await load(`${prefix}-next`);
      const results = await Promise.all([0, 1].map(() => saveCurrentAnalysis(db, frozen, data, [], 0.7)));
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal(await db.analysis.count({ where: { eventId: frozen.id, status: "AUTO_PUBLISHED" } }), 1);
    });
    await t.test("adding and removing supporting material invalidates the published version", async () => {
      const extra = await db.rawDocument.create({ data: { id: `${prefix}-extra`, sourceId: prefix, url: `https://example.com/${prefix}-extra`, title: prefix, content: "附加材料", contentHash: "extra", language: "ZH", processingStatus: "PROCESSED" } });
      await db.eventDocument.create({ data: { eventId: `${prefix}-next`, documentId: extra.id } });
      assert.equal(await db.analysis.count({ where: { eventId: `${prefix}-next`, status: "AUTO_PUBLISHED" } }), 0);
      await saveCurrentAnalysis(db, await load(`${prefix}-next`), data, [], 0.7);
      await db.eventDocument.delete({ where: { eventId_documentId: { eventId: `${prefix}-next`, documentId: extra.id } } });
      assert.equal(await db.analysis.count({ where: { eventId: `${prefix}-next`, status: "AUTO_PUBLISHED" } }), 0);
    });
    await t.test("slow translation does not overwrite a document ingested during processing", async () => {
      failModel = false;
      const english = await db.rawDocument.create({ data: { id: `${prefix}-en`, sourceId: prefix, url: `https://example.com/${prefix}-en`, title: "New model release", content: "This is the original article about a new machine learning model release.", contentHash: "english-first", language: "EN" } });
      hook = async () => {
        await db.rawDocument.update({ where: { id: english.id }, data: { content: "更新后的中文原文", contentHash: "english-second", language: "ZH" } });
      };
      const processed = await run("process-documents"); assert.equal(processed.code, 0, processed.output);
      const current = await db.rawDocument.findUniqueOrThrow({ where: { id: english.id } });
      assert.equal(current.processingStatus, "PENDING");
      assert.equal(current.cleanedContent, null); assert.equal(current.translatedContent, null);
      assert.equal(current.contentHash, "english-second");
    });
  } finally {
    await db.user.deleteMany({ where: { id: prefix } });
    const related = await db.eventDocument.findMany({ where: { documentId: prefix }, select: { eventId: true } });
    await db.event.deleteMany({ where: { id: { in: [prefix, `${prefix}-next`, ...related.map((row) => row.eventId)] } } });
    await db.rawDocument.deleteMany({ where: { sourceId: prefix } }); await db.source.deleteMany({ where: { id: prefix } });
    await db.$disconnect(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
