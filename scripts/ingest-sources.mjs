import { createHash } from "node:crypto";
import { PrismaClient, DocumentLanguage } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";

const prisma = new PrismaClient();
const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: "text" });
const sources = [
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml", type: "OFFICIAL_BLOG", language: DocumentLanguage.EN, trustScore: 0.95 },
  { name: "GitHub AI repositories", url: "https://api.github.com/search/repositories?q=topic%3Aartificial-intelligence+stars%3A%3E10&sort=updated&order=desc&per_page=30", type: "GITHUB_API", language: DocumentLanguage.EN, trustScore: 0.9, format: "github" },
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

for (const config of sources) {
  try {
    let source = await prisma.source.findFirst({ where: { url: config.url } });
    source ??= await prisma.source.create({ data: config });
    const headers = { "User-Agent": "ZhiXianResearch/0.1 (+https://zhixian.asia)", Accept: "application/vnd.github+json" };
    if (config.format === "github" && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetch(config.url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.text();
    const items = config.format === "github"
      ? (JSON.parse(payload).items ?? []).map((repo) => ({
          link: repo.html_url,
          title: `${repo.full_name}: ${repo.name}`,
          description: [repo.description, `Stars: ${repo.stargazers_count}`, `Language: ${repo.language || "unknown"}`, `Forks: ${repo.forks_count}`].filter(Boolean).join("\n"),
          updated: repo.pushed_at,
        }))
      : itemsFrom(payload).slice(0, 30);
    let created = 0;
    for (const item of items) {
      const url = itemUrl(item);
      const title = value(item.title).trim();
      if (!url || !title) continue;
      const content = value(item.description) || value(item.summary) || value(item["content:encoded"]);
      const publishedAtValue = item.pubDate ?? item.published ?? item.updated;
      const publishedAt = publishedAtValue && !Number.isNaN(Date.parse(publishedAtValue)) ? new Date(publishedAtValue) : null;
      const contentHash = createHash("sha256").update(`${url}:${title}`).digest("hex");
      const exists = await prisma.rawDocument.findFirst({ where: { OR: [{ url }, { contentHash }] }, select: { id: true } });
      if (exists) continue;
      await prisma.rawDocument.create({ data: { sourceId: source.id, url, title, content: String(content).slice(0, 50000), language: config.language, publishedAt, contentHash } });
      created += 1;
    }
    console.log(`${config.name}: ${created} new documents`);
  } catch (error) {
    console.error(`${config.name}: ${error.message}`);
  }
}

await prisma.$disconnect();
