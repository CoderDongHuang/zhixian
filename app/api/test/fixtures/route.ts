import { NextResponse } from "next/server";
import { learningDayKey } from "@/lib/learning-day";
import { prisma } from "@/lib/prisma";
import { hashSecret } from "@/lib/auth";
import { isIsolatedE2e } from "@/lib/e2e-policy";

const ids = {
  users: ["e2e-user-a", "e2e-user-b", "e2e-admin"], events: ["e2e-event-ai", "e2e-event-oss"], feeds: ["e2e-feed-ai", "e2e-feed-oss"],
  digest: "e2e-digest", entities: ["e2e-entity-a", "e2e-entity-b"], source: "e2e-source", docs: ["e2e-doc-ai", "e2e-doc-oss"], path: "e2e-path", task: "e2e-task", trendSlugs: ["e2e-github", "e2e-model", "e2e-paper", "e2e-jobs"],
};

async function allowed(request: Request) {
  const host = new URL(request.url).hostname;
  return ["127.0.0.1", "localhost", "[::1]"].includes(host) && Boolean(process.env.E2E_TEST_SECRET) && request.headers.get("x-e2e-secret") === process.env.E2E_TEST_SECRET && await isIsolatedE2e(prisma);
}

async function cleanup() {
  await prisma.emailOtp.deleteMany({ where: { email: { in: ["e2e-a@example.com", "e2e-b@example.com", "e2e-admin@example.com", "e2e-native@example.com"] } } });
  const subjects = [...ids.users, "e2e-a@example.com", "e2e-b@example.com", "e2e-admin@example.com", "e2e-native@example.com"];
  const scopes = ["otp-request-email-minute", "otp-request-email-hour", "otp-request-email-day", "otp-verify-email", "behavior-user-minute"];
  await prisma.authThrottle.deleteMany({ where: { key: { in: subjects.flatMap((subject) => scopes.map((scope) => hashSecret(`auth-throttle:${scope}:${subject}`))) } } });
  await prisma.securityEvent.deleteMany({ where: { subjectHash: { in: subjects.map((subject) => hashSecret(`security-subject:${subject}`)) } } });
  await prisma.trendSubject.deleteMany({ where: { slug: { in: ids.trendSlugs } } });
  await prisma.entityMerge.deleteMany({ where: { OR: [{ sourceEntityId: { in: ids.entities } }, { targetEntityId: { in: ids.entities } }] } });
  await prisma.entityRelation.deleteMany({ where: { OR: [{ fromEntityId: { in: ids.entities } }, { toEntityId: { in: ids.entities } }] } });
  await prisma.entityMention.deleteMany({ where: { OR: [{ entityId: { in: ids.entities } }, { eventId: { in: ids.events } }, { documentId: { in: ids.docs } }] } });
  await prisma.eventRelation.deleteMany({ where: { OR: [{ fromEventId: { in: ids.events } }, { toEventId: { in: ids.events } }] } });
  await prisma.eventTimeline.deleteMany({ where: { eventId: { in: ids.events } } });
  await prisma.eventDocument.deleteMany({ where: { OR: [{ eventId: { in: ids.events } }, { documentId: { in: ids.docs } }] } });
  await prisma.feedItem.deleteMany({ where: { id: { in: ids.feeds } } });
  await prisma.analysis.deleteMany({ where: { eventId: { in: ids.events } } });
  await prisma.reportExport.deleteMany({ where: { OR: [{ digestId: ids.digest }, { userId: { in: ids.users } }] } });
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
  if (!await allowed(request)) return new NextResponse(null, { status: 404 });
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
  await prisma.rawDocument.update({ where: { id: ids.docs[0] }, data: { content: "E2E supporting evidence" } });
  await prisma.rawDocument.update({ where: { id: ids.docs[1] }, data: { content: "E2E conflicting evidence" } });
  await prisma.eventDocument.create({ data: { eventId: ids.events[0], documentId: ids.docs[1] } });
  await prisma.analysis.createMany({ data: [{ eventId: ids.events[0], summary: "E2E AI 深度分析", whyImportant: "验证推荐和交互", confidence: 0.95, status: "AUTO_PUBLISHED", modelVersion: "e2e", facts: "[]", predictions: "[]" }, { eventId: ids.events[1], summary: "E2E 开源项目分析", whyImportant: "验证排序变化", confidence: 0.9, status: "AUTO_PUBLISHED", modelVersion: "e2e", facts: "[]", predictions: "[]" }] });
  const analysis = await prisma.analysis.findFirstOrThrow({ where: { eventId: ids.events[0] }, select: { id: true } });
  for (const eventId of ids.events) {
    const materials = await prisma.eventDocument.findMany({ where: { eventId }, include: { document: { include: { source: true } } } });
    const manifest = materials.map(({ document }) => ({ id: document.id, revision: document.materialRevision, contentHash: document.contentHash, title: document.title, url: document.url, source: document.source.name, publishedAt: now.toISOString(), content: document.content || "", translation: "" }));
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    await prisma.analysis.updateMany({ where: { eventId }, data: { inputManifest: manifest, inputRevision: event.materialRevision } });
  }
  await prisma.evidence.createMany({ data: [{ analysisId: analysis.id, documentId: ids.docs[0], quote: "E2E supporting evidence", stance: "SUPPORT" }, { analysisId: analysis.id, documentId: ids.docs[1], quote: "E2E conflicting evidence", stance: "CONFLICT" }] });
  await prisma.feedItem.createMany({ data: [{ id: ids.feeds[0], eventId: ids.events[0], rank: 0.8 }, { id: ids.feeds[1], eventId: ids.events[1], rank: 0.7 }] });
  await prisma.eventTimeline.create({ data: { eventId: ids.events[0], occurredAt: now, label: "E2E 版本发布", description: "用于验证 7/30/90 天时间线对比", sourceUrl: "https://example.com/e2e-ai" } });
  await prisma.digest.create({ data: { id: ids.digest, key: "e2e-digest-key", type: "WEEKLY", title: "E2E 周报", overview: "用于导出测试", content: { changes: ["变化"], actions: ["行动"], items: [{ eventId: ids.events[0], title: "E2E AI", topic: "AI 行业", whyImportant: "重要", confidence: 0.9, source: "E2E" }] }, periodStart: new Date(now.getTime() - 86400000), periodEnd: now } });
  await prisma.entity.createMany({ data: [{ id: ids.entities[0], type: "COMPANY", name: "E2E Company", normalized: "e2e company", description: "测试公司" }, { id: ids.entities[1], type: "COMPANY", name: "E2E Company Alias", normalized: "e2e company alias", description: "待合并公司" }] });
  await prisma.entityMention.create({ data: { entityId: ids.entities[0], eventId: ids.events[0], documentId: ids.docs[0], context: "E2E context" } });
  await prisma.entityRelation.create({ data: { fromEntityId: ids.entities[0], toEntityId: ids.entities[1], relation: "COOPERATES_WITH", confidence: 0.8 } });
  const trendSubjects = await Promise.all([
    prisma.trendSubject.create({ data: { slug: ids.trendSlugs[0], name: "E2E AI Repository", category: "GITHUB", description: "开源项目活跃度", sourceName: "GitHub API", sourceUrl: "https://github.com/example/e2e-ai", sourceLicense: "GitHub API Terms", methodology: "Stars、Forks、贡献者、发布和 Issue 的 30 天快照。" } }),
    prisma.trendSubject.create({ data: { slug: ids.trendSlugs[1], name: "E2E Model Pro", category: "MODEL_PRODUCT", description: "模型能力与成本变化", sourceName: "E2E Official Pricing", sourceUrl: "https://example.com/model", sourceLicense: "Official public data", methodology: "官方价格、规格与基准版本化记录。" } }),
    prisma.trendSubject.create({ data: { slug: ids.trendSlugs[2], name: "E2E AI Papers", category: "PAPER", description: "主题论文与引用变化", sourceName: "OpenAlex", sourceUrl: "https://openalex.org/C154945302", sourceLicense: "CC0", methodology: "30 天主题论文量，引用与机构基于来源样本。" } }),
    prisma.trendSubject.create({ data: { slug: ids.trendSlugs[3], name: "E2E AI Jobs", category: "JOB", description: "授权岗位样本变化", sourceName: "E2E Licensed Jobs", sourceUrl: "https://example.com/jobs", sourceLicense: "Licensed test dataset", methodology: "30 天去重岗位、技能、地区与有效薪资样本。" } }),
  ]);
  const trendValues = [100, 108, 116, 127, 139, 152, 166, 181];
  for (let index = 0; index < trendValues.length; index++) {
    const observedAt = new Date(now.getTime() - (trendValues.length - 1 - index) * 86400000);
    await prisma.trendSnapshot.createMany({ data: [
      { subjectId: trendSubjects[0].id, observedAt, windowDays: 30, metrics: { stars: trendValues[index], forks: 20 + index, contributors: 8 + index, releases30d: 2 + index % 2, issueVelocity30d: 12 + index }, dimensions: { language: "TypeScript" }, sourceUrl: trendSubjects[0].sourceUrl, sourceFetchedAt: observedAt },
      { subjectId: trendSubjects[1].id, observedAt, windowDays: 30, metrics: { releases30d: 1 + index % 3, inputPricePerMillion: Math.max(1, 8 - index * 0.5), outputPricePerMillion: Math.max(2, 16 - index), contextTokens: 32000 + index * 8000, benchmarkScore: 70 + index }, dimensions: { benchmark: "E2E-Bench" }, dataGaps: index === trendValues.length - 1 ? ["缺少多语言基准"] : [], sourceUrl: trendSubjects[1].sourceUrl, sourceFetchedAt: observedAt },
      { subjectId: trendSubjects[2].id, observedAt, windowDays: 30, metrics: { paperCount: 40 + index * 3, citations: 300 + index * 25, citationGrowth: 25, institutions: 15 + index }, dimensions: { topInstitutions: ["E2E University"] }, sourceUrl: trendSubjects[2].sourceUrl, sourceFetchedAt: observedAt },
      { subjectId: trendSubjects[3].id, observedAt, windowDays: 30, metrics: { jobCount: 60 + index * 4, medianSalary: 32000 + index * 500, remoteShare: 20 + index, skillCoverage: 12 + index }, dimensions: { skills: ["Python", "LLM"], regions: ["上海", "深圳"], salarySamples: 45 + index }, dataGaps: ["仅包含授权样本，不代表全市场"], sourceUrl: trendSubjects[3].sourceUrl, sourceFetchedAt: observedAt },
    ] });
  }
  await prisma.trendForecast.createMany({ data: [
    { subjectId: trendSubjects[0].id, metricKey: "stars", horizonDays: 30, targetAt: new Date(now.getTime() + 30 * 86400000), forecastValue: 300, lowerBound: 250, upperBound: 350, method: "最小二乘线性趋势 + 扩展窗口滚动回测", backtestMae: 3.2, backtestMape: 2.1, sampleSize: 8, trainingWindowStart: new Date(now.getTime() - 7 * 86400000), trainingWindowEnd: now, invalidationRule: "新快照超出预测区间，来源口径变化，或连续 7 天缺少数据时失效" },
    { subjectId: trendSubjects[1].id, metricKey: "contextTokens", horizonDays: 30, targetAt: new Date(now.getTime() + 29 * 86400000), forecastValue: 90000, lowerBound: 80000, upperBound: 100000, method: "最小二乘线性趋势 + 扩展窗口滚动回测", backtestMae: 1200, backtestMape: 2.5, sampleSize: 7, trainingWindowStart: new Date(now.getTime() - 7 * 86400000), trainingWindowEnd: new Date(now.getTime() - 86400000), invalidationRule: "新快照超出预测区间，来源口径变化，或连续 7 天缺少数据时失效" },
  ] });
  await prisma.learningPath.create({ data: { id: ids.path, userId: ids.users[0], title: "E2E 规则学习路线", goal: "提升技能", level: "入门", topics: ["AI 行业"], outline: [{ phase: "基础", objective: "掌握测试基础知识", weeks: 1, topics: ["概念", "实践"] }], modelVersion: "rules-v1", generationReason: "E2E fallback" } });
  await prisma.learningTask.create({ data: { id: "e2e-prerequisite", userId: ids.users[0], pathId: ids.path, taskType: "READING", title: "E2E 先修任务", description: "已完成的先修任务", scheduledFor: new Date(now.getTime() - 86400000), completedAt: now, qualityScore: 90, reason: "E2E", modelVersion: "rules-v1" } });
  await prisma.learningTask.create({ data: { id: ids.task, dayKey: learningDayKey(now, "Asia/Shanghai"), dayTimezone: "Asia/Shanghai", userId: ids.users[0], pathId: ids.path, eventId: ids.events[0], entityId: ids.entities[0], prerequisiteTaskId: "e2e-prerequisite", taskType: "PRACTICE", title: "E2E 今日任务", description: "完成端到端测试任务", scheduledFor: now, reason: "E2E", modelVersion: "rules-v1", exercise: { version: 1, instructions: "完成测试实践", deliverable: "写出测试实践产出", questions: [
    { id: "event", concept: "事件识别", prompt: "任务绑定哪个事件？", kind: "single", options: ["E2E AI Event", "其他事件"], correctAnswers: ["E2E AI Event"], explanation: "任务绑定 E2E AI Event" },
    { id: "impact", concept: "事件影响", prompt: "哪个判断可信？", kind: "single", options: ["验证推荐和交互", "忽略证据"], correctAnswers: ["验证推荐和交互"], explanation: "已发布分析要求验证推荐和交互" },
  ] } } });
  return NextResponse.json({ ok: true, ids, users: { a: "e2e-a@example.com", b: "e2e-b@example.com", admin: "e2e-admin@example.com" } });
}

export async function PATCH(request: Request) {
  if (!await allowed(request)) return new NextResponse(null, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (body.action === "expire-sessions" && ["e2e-a@example.com", "e2e-b@example.com", "e2e-admin@example.com", "e2e-native@example.com"].includes(body.email)) { await prisma.session.updateMany({ where: { user: { email: body.email } }, data: { expiresAt: new Date(0) } }); return NextResponse.json({ ok: true }); }
  if (body.action === "due-learning-reviews") { const review = await prisma.learningReview.findFirst({ where: { userId: ids.users[0], taskId: ids.task }, orderBy: { createdAt: "asc" } }); if (!review) return NextResponse.json({ error: "review not found" }, { status: 404 }); await prisma.learningReview.update({ where: { id: review.id }, data: { dueAt: new Date(0) } }); return NextResponse.json({ ok: true, reviewId: review.id }); }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
