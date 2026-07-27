import { createHash } from "node:crypto";
import { PrismaClient, DocumentLanguage } from "@prisma/client";

const prisma = new PrismaClient();
const userAgent = "ZhiXianResearch/0.2 (+https://zhixian.asia)";
const sources = [
  { name: "Hacker News", url: "https://hn.algolia.com/api/v1/search_by_date?query=AI+OR+LLM+OR+machine+learning&tags=story&hitsPerPage=30", type: "HACKER_NEWS", trustScore: 0.78 },
  { name: "Stack Overflow", url: "https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=activity&q=AI%20LLM%20machine%20learning&site=stackoverflow&pagesize=30", type: "STACK_OVERFLOW", trustScore: 0.76 },
];

function hash(url, title) { return createHash("sha256").update(`${url}:${title}`).digest("hex"); }
function text(value) { return typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""; }
async function upsertSource(config) {
  return prisma.source.upsert({ where: { url: config.url }, update: { name: config.name, type: config.type, trustScore: config.trustScore }, create: { ...config, language: DocumentLanguage.EN } });
}
async function save(source, item) {
  const url = item.url || item.link;
  const title = text(item.title || item.name);
  if (!url || !title) return false;
  const content = text(item.content || item.description || item.story_text || item.body || "").slice(0, 50000);
  const contentHash = hash(url, title);
  const exists = await prisma.rawDocument.findFirst({ where: { OR: [{ url }, { contentHash }] }, select: { id: true } });
  if (exists) return false;
  await prisma.rawDocument.create({ data: { sourceId: source.id, url, title, content, language: DocumentLanguage.EN, publishedAt: item.publishedAt ? new Date(item.publishedAt) : null, contentHash } });
  return true;
}
async function fetchJson(url, headers = {}) { const response = await fetch(url, { headers: { "User-Agent": userAgent, ...headers }, signal: AbortSignal.timeout(20000) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }

let total = 0;
for (const config of sources) {
  try {
    const source = await upsertSource(config);
    const payload = await fetchJson(config.url, process.env.STACKEXCHANGE_API_KEY ? { "X-API-Key": process.env.STACKEXCHANGE_API_KEY } : {});
    const items = config.type === "HACKER_NEWS" ? (payload.hits || []).map((item) => ({ url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`, title: item.title, content: item.story_text || item.comment_text, publishedAt: item.created_at })) : (payload.items || []).map((item) => ({ url: item.link, title: item.title, content: item.body, publishedAt: item.creation_date ? new Date(item.creation_date * 1000).toISOString() : null }));
    let created = 0; for (const item of items) if (await save(source, item)) created++;
    total += created; console.log(`${config.name}: ${created} new documents`);
  } catch (error) { console.error(`${config.name}: ${error.message}`); }
}

if (process.env.PRODUCT_HUNT_ENABLED === "true" && process.env.PRODUCT_HUNT_CLIENT_ID && process.env.PRODUCT_HUNT_CLIENT_SECRET) {
  try {
    const tokenResponse = await fetch("https://api.producthunt.com/v2/oauth/token", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": userAgent }, body: JSON.stringify({ client_id: process.env.PRODUCT_HUNT_CLIENT_ID, client_secret: process.env.PRODUCT_HUNT_CLIENT_SECRET, grant_type: "client_credentials" }), signal: AbortSignal.timeout(20000) });
    if (!tokenResponse.ok) throw new Error(`Token HTTP ${tokenResponse.status}`);
    const { access_token: token } = await tokenResponse.json();
    const source = await upsertSource({ name: "Product Hunt", url: "https://api.producthunt.com/v2/posts", type: "PRODUCT_HUNT", trustScore: 0.8 });
    const query = "query { posts(first: 30, order: NEWEST) { edges { node { id name tagline description url createdAt } } } }";
    const response = await fetch("https://api.producthunt.com/v2/api/graphql", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": userAgent }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);
    const payload = await response.json(); let created = 0;
    for (const { node } of payload.data?.posts?.edges || []) if (await save(source, { url: node.url, title: node.name, content: `${node.tagline || ""}\n${node.description || ""}`, publishedAt: node.createdAt })) created++;
    total += created; console.log(`Product Hunt: ${created} new documents`);
  } catch (error) { console.error(`Product Hunt: ${error.message}`); }
}

console.log({ total }); await prisma.$disconnect();
