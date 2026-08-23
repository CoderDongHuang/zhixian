import { PrismaClient, DocumentLanguage } from "@prisma/client";
import { finishJob } from "./job-policy.mjs";
import { documentContentHash } from "./ingest-policy.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const userAgent = "ZhiXianResearch/0.2 (+https://zhixian.asia)";
const sources = [
  { name: "Hacker News", url: "https://hn.algolia.com/api/v1/search_by_date?query=AI+OR+LLM+OR+machine+learning&tags=story&hitsPerPage=30", type: "HACKER_NEWS", trustScore: 0.78 },
  { name: "Stack Overflow", url: "https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=activity&q=AI%20LLM%20machine%20learning&site=stackoverflow&pagesize=30", type: "STACK_OVERFLOW", trustScore: 0.76 },
];

function text(value) { return typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""; }
async function upsertSource(config) {
  const existing = await prisma.source.findFirst({ where: { url: config.url } });
  if (existing) {
    return prisma.source.update({ where: { id: existing.id }, data: { name: config.name, type: config.type, trustScore: config.trustScore } });
  }
  return prisma.source.create({ data: { ...config, language: DocumentLanguage.EN } });
}
async function save(source, item) {
  const url = item.url || item.link;
  const title = text(item.title || item.name);
  if (!url || !title) return "skipped";
  const content = text(item.content || item.description || item.story_text || item.body || "").slice(0, 50000);
  const contentHash = documentContentHash(title, content);
  const existing = await prisma.rawDocument.findUnique({ where: { url }, select: { id: true, contentHash: true } });
  if (existing?.contentHash === contentHash) return "unchanged";
  const document = existing
    ? await prisma.rawDocument.update({ where: { id: existing.id }, data: { sourceId: source.id, title, content, publishedAt: item.publishedAt ? new Date(item.publishedAt) : null, fetchedAt: new Date(), contentHash, processingStatus: "PENDING", processedAt: null, processingError: null, cleanedContent: null, translatedContent: null, topic: null } })
    : await prisma.rawDocument.create({ data: { sourceId: source.id, url, title, content, language: DocumentLanguage.EN, publishedAt: item.publishedAt ? new Date(item.publishedAt) : null, contentHash } });
  await prisma.sourceSnapshot.create({ data: { sourceId: source.id, documentId: document.id, url, title, content, contentHash, publishedAt: item.publishedAt ? new Date(item.publishedAt) : null } });
  return existing ? "updated" : "created";
}
async function fetchJson(url, headers = {}) { const response = await fetch(url, { headers: { "User-Agent": userAgent, ...headers }, signal: AbortSignal.timeout(20000) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }

let created = 0, updated = 0, unchanged = 0, skipped = 0, failed = 0, attemptedSources = 0;
for (const config of sources) {
  try {
    attemptedSources++;
    const source = await upsertSource(config);
    const payload = await fetchJson(config.url, process.env.STACKEXCHANGE_API_KEY ? { "X-API-Key": process.env.STACKEXCHANGE_API_KEY } : {});
    const items = config.type === "HACKER_NEWS" ? (payload.hits || []).map((item) => ({ url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`, title: item.title, content: item.story_text || item.comment_text, publishedAt: item.created_at })) : (payload.items || []).map((item) => ({ url: item.link, title: item.title, content: item.body, publishedAt: item.creation_date ? new Date(item.creation_date * 1000).toISOString() : null }));
    const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 }; for (const item of items) counts[await save(source, item)]++;
    created += counts.created; updated += counts.updated; unchanged += counts.unchanged; skipped += counts.skipped; console.log(`${config.name}: ${JSON.stringify(counts)}`);
  } catch (error) { failed++; console.error(`${config.name}: ${error.message}`); }
}

if (process.env.PRODUCT_HUNT_ENABLED === "true" && process.env.PRODUCT_HUNT_CLIENT_ID && process.env.PRODUCT_HUNT_CLIENT_SECRET) {
  try {
    attemptedSources++;
    const tokenResponse = await fetch("https://api.producthunt.com/v2/oauth/token", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": userAgent }, body: JSON.stringify({ client_id: process.env.PRODUCT_HUNT_CLIENT_ID, client_secret: process.env.PRODUCT_HUNT_CLIENT_SECRET, grant_type: "client_credentials" }), signal: AbortSignal.timeout(20000) });
    if (!tokenResponse.ok) throw new Error(`Token HTTP ${tokenResponse.status}`);
    const { access_token: token } = await tokenResponse.json();
    const source = await upsertSource({ name: "Product Hunt", url: "https://api.producthunt.com/v2/posts", type: "PRODUCT_HUNT", trustScore: 0.8 });
    const query = "query { posts(first: 30, order: NEWEST) { edges { node { id name tagline description url createdAt } } } }";
    const response = await fetch("https://api.producthunt.com/v2/api/graphql", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": userAgent }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);
    const payload = await response.json(); const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
    for (const { node } of payload.data?.posts?.edges || []) counts[await save(source, { url: node.url, title: node.name, content: `${node.tagline || ""}\n${node.description || ""}`, publishedAt: node.createdAt })]++;
    created += counts.created; updated += counts.updated; unchanged += counts.unchanged; skipped += counts.skipped; console.log(`Product Hunt: ${JSON.stringify(counts)}`);
  } catch (error) { failed++; console.error(`Product Hunt: ${error.message}`); }
}

await finishJob({ prisma, name: "community-ingest", summary: { sources: attemptedSources, created, updated, unchanged, skipped, failed }, startedAt, attempts: attemptedSources, output: created + updated });
await prisma.$disconnect();
