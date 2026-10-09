import { PrismaClient, TrendCategory } from "@prisma/client";
import { finishJob } from "./job-policy.mjs";
import { runTask, assertTaskLease, replayTarget, requireReplaySelection } from "../lib/pipeline-tasks.mjs";
import { isTrendCategory, normalizeDataGaps, normalizeFeedObservations, normalizeTrendMetrics, parseTrendWindow, requireHttpsUrl } from "../lib/trend-policy.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const replay = await replayTarget(prisma, ["trend-github", "trend-paper", "trend-feed", "trend-bridge"]);
const pollRevision = replay?.revision ?? String(Math.floor(startedAt.getTime() / 900000));
let selected = 0;
async function collectTask(name, resourceId, work) {
  if (replay && (replay.name !== name || replay.resourceId !== resourceId)) return { skipped: true };
  selected++;
  return runTask(prisma, { name, resourceId, revision: pollRevision }, work);
}
async function persistObservations(config, observations) {
  return prisma.$transaction(async (tx) => {
    await assertTaskLease(tx);
    for (const observation of observations) await saveObservation(tx, config, observation);
  });
}
const userAgent = "ZhiXianResearch/0.7 (+https://zhixian.asia)";
const githubToken = process.env.GITHUB_TOKEN;

function parseJsonEnv(name, fallback = []) {
  if (!process.env[name]) return fallback;
  const parsed = JSON.parse(process.env[name]);
  if (!Array.isArray(parsed)) throw new Error(`${name} must be a JSON array`);
  return parsed;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return { data: await response.json(), headers: response.headers };
}

function githubHeaders() {
  return githubToken ? { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } : { Accept: "application/vnd.github+json" };
}

function lastPageCount(headers, fallback) {
  const link = headers.get("link") || "";
  const match = link.match(/[?&]page=(\d+)[^>]*>; rel="last"/);
  return match ? Number(match[1]) : fallback;
}

async function saveObservation(store, config, payload) {
  if (!isTrendCategory(config.category)) throw new Error(`Unsupported trend category: ${config.category}`);
  if (config.category === "JOB" && !String(config.sourceLicense || "").trim()) throw new Error(`Job source ${config.name} requires sourceLicense`);
  const slug = String(config.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
  const name = String(config.name || "").trim().slice(0, 160);
  const sourceUrl = requireHttpsUrl(String(payload.sourceUrl || config.sourceUrl || config.endpoint || "").trim().slice(0, 1000), `${config.name || "Trend source"} sourceUrl`);
  if (!slug || !name || !sourceUrl) throw new Error("Trend source requires slug, name and source URL");
  const metrics = normalizeTrendMetrics(config.category, payload.metrics);
  if (!Object.keys(metrics).length) throw new Error(`${slug}: no valid metrics`);
  const observedAt = new Date(payload.observedAt || Date.now());
  if (Number.isNaN(observedAt.getTime()) || observedAt > new Date(Date.now() + 300000)) throw new Error(`${slug}: invalid observedAt`);
  const sourceFetchedAt = new Date(payload.sourceFetchedAt || Date.now());
  if (Number.isNaN(sourceFetchedAt.getTime()) || sourceFetchedAt > new Date(Date.now() + 300000)) throw new Error(`${slug}: invalid sourceFetchedAt`);
  const dimensions = payload.dimensions && typeof payload.dimensions === "object" && !Array.isArray(payload.dimensions) ? payload.dimensions : undefined;
  if (dimensions && JSON.stringify(dimensions).length > 20000) throw new Error(`${slug}: dimensions exceed 20 KB`);
  const subject = await store.trendSubject.upsert({
    where: { slug },
    update: { name, category: config.category, description: String(config.description || "").trim().slice(0, 1000) || null, sourceName: String(config.sourceName || name).slice(0, 160), sourceUrl, sourceLicense: String(config.sourceLicense || "").trim().slice(0, 200) || null, methodology: String(config.methodology || "来源原始指标标准化为趋势快照").slice(0, 2000), enabled: true },
    create: { slug, name, category: config.category, description: String(config.description || "").trim().slice(0, 1000) || null, sourceName: String(config.sourceName || name).slice(0, 160), sourceUrl, sourceLicense: String(config.sourceLicense || "").trim().slice(0, 200) || null, methodology: String(config.methodology || "来源原始指标标准化为趋势快照").slice(0, 2000) },
  });
  await store.trendSnapshot.upsert({
    where: { subjectId_observedAt: { subjectId: subject.id, observedAt } },
    update: { windowDays: parseTrendWindow(payload.windowDays), metrics, dimensions, dataGaps: normalizeDataGaps(payload.dataGaps), sourceUrl, sourceFetchedAt },
    create: { subjectId: subject.id, observedAt, windowDays: parseTrendWindow(payload.windowDays), metrics, dimensions, dataGaps: normalizeDataGaps(payload.dataGaps), sourceUrl, sourceFetchedAt },
  });
  return subject.id;
}

async function collectGithub(repoName) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoName)) throw new Error(`Invalid GitHub repository: ${repoName}`);
  const base = `https://api.github.com/repos/${repoName}`;
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [repo, contributors, releases, issues] = await Promise.all([
    fetchJson(base, githubHeaders()),
    fetchJson(`${base}/contributors?per_page=1&anon=true`, githubHeaders()),
    fetchJson(`${base}/releases?per_page=100`, githubHeaders()),
    fetchJson(`https://api.github.com/search/issues?q=repo:${repoName}+is:issue+created:>=${since}&per_page=1`, githubHeaders()),
  ]);
  const metrics = {
    stars: repo.data.stargazers_count,
    forks: repo.data.forks_count,
    contributors: lastPageCount(contributors.headers, contributors.data.length),
    releases30d: releases.data.filter((release) => release.published_at && Date.parse(release.published_at) >= Date.now() - 30 * 86400000).length,
    issueVelocity30d: issues.data.total_count,
  };
  const dataGaps = githubToken ? [] : ["未配置 GITHUB_TOKEN，受匿名 API 频率限制"];
  if (releases.data.length === 100) dataGaps.push("Release 接口达到单次 100 条上限，30 天发布数可能被截断");
  return persistObservations({ category: TrendCategory.GITHUB, slug: `github-${repoName.replace("/", "-")}`, name: repo.data.full_name, sourceName: "GitHub API", sourceUrl: repo.data.html_url, sourceLicense: "GitHub API Terms", methodology: "Stars、Forks 取仓库当前值；贡献者取分页总数；发布和 Issue 变化按最近 30 天计数。" }, [{ metrics, observedAt: new Date(), windowDays: 30, sourceUrl: repo.data.html_url, dimensions: { language: repo.data.language, topics: repo.data.topics || [] }, dataGaps }]);
}

async function bridgeGithubSnapshots() {
  const rows = await prisma.sourceSnapshot.findMany({ where: { source: { type: "GITHUB_API" }, ...(replay ? { id: replay.resourceId } : {}) }, include: { source: true }, orderBy: { fetchedAt: "desc" }, take: 100 });
  const latest = new Map();
  for (const row of rows) if (row.metrics && !latest.has(row.url)) latest.set(row.url, row);
  let saved = 0;
  for (const row of latest.values()) {
    const repoName = new URL(row.url).pathname.replace(/^\//, "");
    const task = await collectTask("trend-bridge", row.id, async () => {
    await persistObservations({ category: TrendCategory.GITHUB, slug: `github-${repoName.replace("/", "-")}`, name: repoName, sourceName: row.source.name, sourceUrl: row.url, sourceLicense: "GitHub API Terms", methodology: "由既有 SourceSnapshot 转换；贡献者、发布频率和 Issue 速度待专用采集补齐。" }, [{ metrics: row.metrics, observedAt: row.fetchedAt, windowDays: 30, sourceUrl: row.url, sourceFetchedAt: row.fetchedAt, dataGaps: ["缺少贡献者数据", "缺少 30 天发布频率", "缺少 30 天 Issue 变化"] }]);
    return true;
    });
    if (!task.skipped) saved++;
  }
  return saved;
}

async function collectOpenAlex(config) {
  const conceptId = String(config.conceptId || "").trim();
  if (!/^C\d+$/.test(conceptId)) throw new Error(`${config.name}: invalid OpenAlex conceptId`);
  const windowDays = parseTrendWindow(config.windowDays);
  const from = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
  const url = `https://api.openalex.org/works?filter=concepts.id:${conceptId},from_publication_date:${from}&per-page=200&select=id,cited_by_count,authorships`;
  const { data } = await fetchJson(url);
  const institutions = new Map();
  let citations = 0;
  for (const work of data.results || []) {
    citations += Number(work.cited_by_count) || 0;
    for (const authorship of work.authorships || []) for (const institution of authorship.institutions || []) if (institution.id) institutions.set(institution.id, institution.display_name);
  }
  const previous = await prisma.trendSubject.findUnique({ where: { slug: config.slug }, include: { snapshots: { orderBy: { observedAt: "desc" }, take: 1 } } });
  const previousCitations = Number(previous?.snapshots[0]?.metrics?.citations);
  return persistObservations({ ...config, category: TrendCategory.PAPER, sourceName: "OpenAlex", sourceUrl: `https://openalex.org/${conceptId}`, sourceLicense: "CC0", methodology: `论文量使用 OpenAlex 窗口总数；引用与机构分布基于最多 200 篇返回样本，窗口 ${windowDays} 天。` }, [{ metrics: { paperCount: data.meta?.count, citations, citationGrowth: Number.isFinite(previousCitations) ? Math.max(0, citations - previousCitations) : undefined, institutions: institutions.size }, dimensions: { topInstitutions: [...institutions.values()].slice(0, 10), sampledWorks: (data.results || []).length }, observedAt: new Date(), windowDays, sourceUrl: url, dataGaps: data.meta?.count > 200 ? ["引用量和机构分布仅统计前 200 篇样本"] : [] }]);
}

let attempted = 0, saved = 0, failed = 0;
const githubRepos = String(process.env.GITHUB_TREND_REPOS || "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 20);
for (const repo of githubRepos) { attempted++; try { const task = await collectTask("trend-github", repo, () => collectGithub(repo)); if (!task.skipped) saved++; } catch (error) { failed++; console.error(`${repo}: ${error.message}`); } }
if (!githubRepos.length || replay?.name === "trend-bridge") { attempted++; try { saved += await bridgeGithubSnapshots(); } catch (error) { failed++; console.error(`GitHub snapshot bridge: ${error.message}`); } }

for (const config of parseJsonEnv("TREND_PAPER_TOPICS_JSON").slice(0, 20)) { attempted++; try { const task = await collectTask("trend-paper", config.slug, () => collectOpenAlex(config)); if (!task.skipped) saved++; } catch (error) { failed++; console.error(`${config.name || "OpenAlex"}: ${error.message}`); } }
for (const config of parseJsonEnv("TREND_FEEDS_JSON").slice(0, 30)) {
  attempted++;
  try {
    const task = await collectTask("trend-feed", config.slug, async () => {
    if (![TrendCategory.MODEL_PRODUCT, TrendCategory.JOB].includes(config.category)) throw new Error("TREND_FEEDS_JSON only supports MODEL_PRODUCT and JOB categories");
    if (!String(config.sourceLicense || "").trim()) throw new Error("Configured trend feeds require sourceLicense");
    const authorizationEnv = String(config.authorizationEnv || "");
    if (authorizationEnv && !/^TREND_FEED_TOKEN_[A-Z0-9_]+$/.test(authorizationEnv)) throw new Error("authorizationEnv must use the TREND_FEED_TOKEN_ prefix");
    if (authorizationEnv && !process.env[authorizationEnv]) throw new Error(`${authorizationEnv} is not configured`);
    const endpoint = requireHttpsUrl(config.endpoint, `${config.name || "Trend feed"} endpoint`);
    const { data } = await fetchJson(endpoint, authorizationEnv ? { Authorization: `Bearer ${process.env[authorizationEnv]}` } : {});
    const observations = normalizeFeedObservations(data);
    if (!observations.length) throw new Error("Trend feed returned no valid observations");
    await persistObservations(config, observations);
    return true;
    });
    if (!task.skipped) saved++;
  } catch (error) { failed++; console.error(`${config.name || config.endpoint}: ${error.message}`); }
}

requireReplaySelection(replay, selected ? [true] : []);
await finishJob({ prisma, name: "trend-collect", summary: { attempted, saved, failed }, startedAt, attempts: attempted, output: saved });
await prisma.$disconnect();
