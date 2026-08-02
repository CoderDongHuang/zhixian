import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ids = {
  users: ["e2e-user-a", "e2e-user-b", "e2e-admin"], events: ["e2e-event-ai", "e2e-event-oss"], feeds: ["e2e-feed-ai", "e2e-feed-oss"],
  digest: "e2e-digest", entities: ["e2e-entity-a", "e2e-entity-b"], source: "e2e-source", docs: ["e2e-doc-ai", "e2e-doc-oss"], path: "e2e-path", task: "e2e-task",
};

function allowed(request: Request) {
  return process.env.VERCEL_ENV !== "production" && process.env.E2E_TEST_MODE === "true" && Boolean(process.env.E2E_TEST_SECRET) && request.headers.get("x-e2e-secret") === process.env.E2E_TEST_SECRET;
}

async function cleanup() {
  await prisma.entityMerge.deleteMany({ where: { OR: [{ sourceEntityId: { in: ids.entities } }, { targetEntityId: { in: ids.entities } }] } });
  await prisma.entityRelation.deleteMany({ where: { OR: [{ fromEntityId: { in: ids.entities } }, { toEntityId: { in: ids.entities } }] } });
  await prisma.entityMention.deleteMany({ where: { OR: [{ entityId: { in: ids.entities } }, { eventId: { in: ids.events } }, { documentId: { in: ids.docs } }] } });
  await prisma.eventRelation.deleteMany({ where: { OR: [{ fromEventId: { in: ids.events } }, { toEventId: { in: ids.events } }] } });
  await prisma.eventTimeline.deleteMany({ where: { eventId: { in: ids.events } } });
  await prisma.eventDocument.deleteMany({ where: { OR: [{ eventId: { in: ids.events } }, { documentId: { in: ids.docs } }] } });
  await prisma.feedItem.deleteMany({ where: { id: { in: ids.feeds } } });
  await prisma.analysis.deleteMany({ where: { eventId: { in: ids.events } } });
  await prisma.learningTask.deleteMany({ where: { OR: [{ id: ids.task }, { pathId: ids.path }, { userId: { in: ids.users } }] } });
  await prisma.learningPath.deleteMany({ where: { OR: [{ id: ids.path }, { userId: { in: ids.users } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.entity.deleteMany({ where: { id: { in: ids.entities } } });
  await prisma.event.deleteMany({ where: { id: { in: ids.events } } });
  await prisma.digest.deleteMany({ where: { id: ids.digest } });
  await prisma.rawDocument.deleteMany({ where: { id: { in: ids.docs } } });
  await prisma.source.deleteMany({ where: { id: ids.source } });
}

export async function POST(request: Request) {
  if (!allowed(request)) return new NextResponse(null, { status: 404 });
  const body = await request.json().catch(() => ({}));
  await cleanup();
  if (body.action === "cleanup") return NextResponse.json({ ok: true });
  const now = new Date();
  await prisma.user.createMany({ data: [{ id: ids.users[0], email: "e2e-a@example.com" }, { id: ids.users[1], email: "e2e-b@example.com" }, { id: ids.users[2], email: "e2e-admin@example.com" }] });
  await prisma.userPreference.createMany({ data: ids.users.map((userId) => ({ userId, topics: ["AI 行业"], identity: "开发者", level: "入门", skillDirections: ["AI 应用"], learningGoals: ["提升技能"] })) });
  await prisma.source.create({ data: { id: ids.source, name: "E2E Source", url: "https://example.com/e2e", type: "test", language: "EN" } });
  await prisma.rawDocument.createMany({ data: [{ id: ids.docs[0], sourceId: ids.source, url: "https://example.com/e2e-ai", title: "E2E AI", language: "EN", contentHash: "e2e-ai-hash", processingStatus: "PROCESSED" }, { id: ids.docs[1], sourceId: ids.source, url: "https://example.com/e2e-oss", title: "E2E OSS", language: "EN", contentHash: "e2e-oss-hash", processingStatus: "PROCESSED" }] });
  await prisma.event.createMany({ data: [{ id: ids.events[0], title: "E2E AI Event", clusterKey: "e2e-ai", topic: "AI 行业", type: "release", importance: 0.9 }, { id: ids.events[1], title: "E2E OSS Event", clusterKey: "e2e-oss", topic: "GitHub 开源项目", type: "release", importance: 0.6 }] });
  await prisma.eventDocument.createMany({ data: [{ eventId: ids.events[0], documentId: ids.docs[0] }, { eventId: ids.events[1], documentId: ids.docs[1] }] });
  await prisma.analysis.createMany({ data: [{ eventId: ids.events[0], summary: "E2E AI 深度分析", whyImportant: "验证推荐和交互", confidence: 0.95, status: "AUTO_PUBLISHED", modelVersion: "e2e", facts: "[]", predictions: "[]" }, { eventId: ids.events[1], summary: "E2E 开源项目分析", whyImportant: "验证排序变化", confidence: 0.9, status: "AUTO_PUBLISHED", modelVersion: "e2e", facts: "[]", predictions: "[]" }] });
  await prisma.feedItem.createMany({ data: [{ id: ids.feeds[0], eventId: ids.events[0], rank: 0.8 }, { id: ids.feeds[1], eventId: ids.events[1], rank: 0.7 }] });
  await prisma.digest.create({ data: { id: ids.digest, key: "e2e-digest-key", type: "WEEKLY", title: "E2E 周报", overview: "用于导出测试", content: { changes: ["变化"], actions: ["行动"], items: [{ eventId: ids.events[0], title: "E2E AI", topic: "AI 行业", whyImportant: "重要", confidence: 0.9, source: "E2E" }] }, periodStart: new Date(now.getTime() - 86400000), periodEnd: now } });
  await prisma.entity.createMany({ data: [{ id: ids.entities[0], type: "COMPANY", name: "E2E Company", normalized: "e2e company", description: "测试公司" }, { id: ids.entities[1], type: "COMPANY", name: "E2E Company Alias", normalized: "e2e company alias", description: "待合并公司" }] });
  await prisma.entityMention.create({ data: { entityId: ids.entities[0], eventId: ids.events[0], documentId: ids.docs[0], context: "E2E context" } });
  await prisma.entityRelation.create({ data: { fromEntityId: ids.entities[0], toEntityId: ids.entities[1], relation: "COOPERATES_WITH", confidence: 0.8 } });
  await prisma.learningPath.create({ data: { id: ids.path, userId: ids.users[0], title: "E2E 规则学习路线", goal: "提升技能", level: "入门", topics: ["AI 行业"], outline: [{ phase: "基础", objective: "掌握测试基础知识", weeks: 1, topics: ["概念", "实践"] }], modelVersion: "rules-v1", generationReason: "E2E fallback" } });
  await prisma.learningTask.create({ data: { id: ids.task, userId: ids.users[0], pathId: ids.path, title: "E2E 今日任务", description: "完成端到端测试任务", scheduledFor: now, reason: "E2E", modelVersion: "rules-v1" } });
  return NextResponse.json({ ok: true, ids, users: { a: "e2e-a@example.com", b: "e2e-b@example.com", admin: "e2e-admin@example.com" } });
}

export async function PATCH(request: Request) {
  if (!allowed(request)) return new NextResponse(null, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (body.action === "expire-sessions") { await prisma.session.updateMany({ where: { user: { email: body.email } }, data: { expiresAt: new Date(0) } }); return NextResponse.json({ ok: true }); }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
