import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { getRawFeed, publicSourceUrl } from "../lib/raw-feed.ts";

test("raw feed links allow only public HTTP links without embedded credentials", () => {
  assert.equal(publicSourceUrl("https://github.com/example/repo"), "https://github.com/example/repo");
  for (const value of ["javascript:alert(1)", "data:text/html,test", "https://name:secret@example.com", "/events/private", "not a url"]) assert.equal(publicSourceUrl(value), null);
});

test("pending public materials appear before analysis, topics work for existing unprocessed rows", async () => {
  let selection: unknown;
  const db = { rawDocument: { findMany: async (query: unknown) => {
    selection = query;
    return [
      { id: "pending", title: "New repository", topic: null, url: "https://github.com/example/repo", source: { name: "GitHub", type: "GITHUB_API" } },
      { id: "invalid", title: "Invalid", topic: null, url: "javascript:alert(1)", source: { name: "GitHub", type: "GITHUB_API" } },
    ];
  } } } as unknown as PrismaClient;
  const items = await getRawFeed(db, "GitHub 开源项目");
  assert.deepEqual(items.map(item => item.id), ["pending"]);
  const query = selection as { where: { source: { type: { in: string[] } } }; select: Record<string, unknown> };
  assert.ok(query.where.source.type.in.includes("GITHUB_API"));
  assert.ok(!query.where.source.type.in.includes("USER_UPLOAD"));
  for (const privateField of ["content", "translatedContent", "event", "analyses"]) assert.equal(query.select[privateField], undefined);
});
