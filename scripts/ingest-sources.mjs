import { PrismaClient, DocumentLanguage } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import { finishJob } from "./job-policy.mjs";
import { runTask, assertTaskLease, replayTarget, requireReplaySelection } from "../lib/pipeline-tasks.mjs";
import { documentContentHash, githubMetrics, normalizeDocumentText } from "./ingest-policy.mjs";

const prisma = new PrismaClient({ transactionOptions: { maxWait: 15000, timeout: 60000 } });
const startedAt = new Date();
const replay = await replayTarget(prisma, "source-ingest");
const pollRevision = replay?.revision ?? String(Math.floor(startedAt.getTime() / 900000));
const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: "text" });
const sources = [
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml", type: "OFFICIAL_BLOG", language: DocumentLanguage.EN, trustScore: 0.95 },
  { name: "GitHub AI repositories", url: "https://api.github.com/search/repositories?q=topic%3Aartificial-intelligence+stars%3A%3E10&sort=updated&order=desc&per_page=30", type: "GITHUB_API", language: DocumentLanguage.EN, trustScore: 0.9, format: "github", mutable: true },
  { name: "arXiv cs.AI", url: "https://rss.arxiv.org/rss/cs.AI", type: "PAPER", language: DocumentLanguage.EN, trustScore: 0.9 },
];

function value(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return input.text ?? input["#text"] ?? "";
  return "";
}

function itemsFrom(xml) {
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  return Array.isArray(items) ? items : [items];
}

function itemUrl(item) {
  if (typeof item.link === "string") return item.link;
  if (item.link?.["@_href"]) return item.link["@_href"];
  if (Array.isArray(item.link)) return item.link.find((link) => link?.["@_href"])?.["@_href"] ?? "";
  return item.guid?.["#text"] ?? item.guid ?? "";
}

let created = 0, updated = 0, unchanged = 0, snapshots = 0, failed = 0;
requireReplaySelection(replay, sources.filter((item) => !replay || replay.resourceId === item.url));
for (const config of sources.filter((item) => !replay || replay.resourceId === item.url)) {
  try {
    await runTask(prisma, { name: "source-ingest", resourceId: config.url, revision: pollRevision }, async () => {
    let source = await prisma.source.findFirst({ where: { url: config.url } });
    const sourceData = { name: config.name, url: config.url, type: config.type, language: config.language, trustScore: config.trustScore };
    source = source ? await prisma.source.update({ where: { id: source.id }, data: sourceData }) : await prisma.source.create({ data: sourceData });
    const headers = { "User-Agent": "ZhiXianResearch/0.1 (+https://zhixian.asia)", Accept: "application/vnd.github+json" };
    if (config.format === "github" && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    if (source.etag) headers["If-None-Match"] = source.etag;
    if (source.lastModified) headers["If-Modified-Since"] = source.lastModified;
    const response = await fetch(config.url, { headers, signal: AbortSignal.timeout(15000) });
    if (response.status === 304) {
      await prisma.$transaction(async (tx) => { await assertTaskLease(tx); await tx.source.update({ where: { id: source.id }, data: { lastFetchedAt: new Date(), fetchVersion: { increment: 1 } } }); });
      console.log(`${config.name}: not modified`);
      return true;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.text();
    const counts = await prisma.$transaction(async (tx) => {
      await assertTaskLease(tx);
    const items = config.format === "github"
      ? (JSON.parse(payload).items ?? []).map((repo) => ({
          link: repo.html_url,
          title: `${repo.full_name}: ${repo.name}`,
          description: [repo.description, `Stars: ${repo.stargazers_count}`, `Language: ${repo.language || "unknown"}`, `Forks: ${repo.forks_count}`].filter(Boolean).join("\n"),
          updated: repo.pushed_at,
          metrics: githubMetrics(repo),
        }))
      : itemsFrom(payload).slice(0, 30);
    const counts = { created: 0, updated: 0, unchanged: 0, snapshots: 0 };
    for (const item of items) {
      const url = itemUrl(item);
      const title = value(item.title).trim();
      if (!url || !title) continue;
      const content = normalizeDocumentText(value(item.description) || value(item.summary) || value(item["content:encoded"])).slice(0, 50000);
      const publishedAtValue = item.pubDate ?? item.published ?? item.updated;
      const publishedAt = publishedAtValue && !Number.isNaN(Date.parse(publishedAtValue)) ? new Date(publishedAtValue) : null;
      const contentHash = documentContentHash(title, content);
      const existing = await tx.rawDocument.findUnique({ where: { url }, select: { id: true, contentHash: true } });
      const changed = !existing || existing.contentHash !== contentHash;
      const document = existing
        ? await tx.rawDocument.update({ where: { id: existing.id }, data: { sourceId: source.id, title, content, language: config.language, publishedAt, fetchedAt: new Date(), contentHash, ...(changed ? { processingStatus: "PENDING", processedAt: null, processingError: null, cleanedContent: null, translatedContent: null, topic: null } : {}) } })
        : await tx.rawDocument.create({ data: { sourceId: source.id, url, title, content, language: config.language, publishedAt, contentHash } });
      if (!existing) counts.created++;
      else if (changed) counts.updated++;
      else counts.unchanged++;
      if (config.mutable || changed) {
        await tx.sourceSnapshot.create({ data: { sourceId: source.id, documentId: document.id, url, title, content, contentHash, publishedAt, ...(item.metrics ? { metrics: item.metrics } : {}) } });
        counts.snapshots++;
      }
    }
    await tx.source.update({ where: { id: source.id }, data: { etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), lastFetchedAt: new Date(), fetchVersion: { increment: 1 } } });
    return counts;
    }, { maxWait: 15000, timeout: 60000 });
    created += counts.created; updated += counts.updated; unchanged += counts.unchanged; snapshots += counts.snapshots;
    console.log(`${config.name}: fetch completed`);
    return true;
    });
  } catch (error) {
    failed++;
    console.error(`${config.name}: ${error.message}`);
  }
}

await finishJob({ prisma, name: "source-ingest", summary: { sources: sources.length, created, updated, unchanged, snapshots, failed }, startedAt, attempts: sources.length, output: created + updated });
await prisma.$disconnect();
