import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { frozenDocuments, locateFrozenQuote } from "@/lib/research-evidence";
import {
  buildResearchOutline,
  buildRuleBasedAnswer,
  evidenceClaimKind,
  filterEvidenceForMode,
  normalizeEvidence,
  parseResearchModelAnswer,
  researchAgentRefusal,
  type ResearchAgentAnswer,
  type ResearchAgentEvidence,
  type ResearchAgentModeValue,
} from "@/lib/research-agent-policy";

type CollectionItem = { targetType: "EVENT" | "ENTITY" | "DIGEST"; targetId: string; targetTitle: string };
type EvidenceTarget = CollectionItem & { eventIds: Set<string> };
export type ResearchModelConfig = { key: string; url: string; model: string; timeoutMs: number };

function digestEventIds(content: unknown) {
  if (!content || typeof content !== "object") return [];
  const items = (content as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => item && typeof item === "object" && typeof (item as { eventId?: unknown }).eventId === "string" ? [(item as { eventId: string }).eventId] : []);
}

function safeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString().slice(0, 2000) : "";
  } catch {
    return "";
  }
}

function configuredModel(): ResearchModelConfig | null {
  const key = process.env.RESEARCH_AI_API_KEY?.trim();
  const url = process.env.RESEARCH_AI_API_URL?.trim();
  const model = process.env.RESEARCH_AI_MODEL?.trim();
  if (!key || !url || !model) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") throw new Error("RESEARCH_AI_API_URL must use HTTPS");
  const requestedTimeout = Number(process.env.RESEARCH_AI_TIMEOUT_MS || 30000);
  return { key, url: parsed.toString(), model, timeoutMs: Number.isFinite(requestedTimeout) ? Math.min(60000, Math.max(5000, requestedTimeout)) : 30000 };
}

export async function collectResearchEvidence(userId: string, collectionId: string, mode: ResearchAgentModeValue, targetKeys: string[] = [], now = new Date()) {
  const collection = await prisma.researchCollection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true, title: true, items: { orderBy: { createdAt: "asc" }, select: { targetType: true, targetId: true, targetTitle: true } } },
  });
  if (!collection) return null;
  const allowedTargets = new Set(targetKeys);
  const scopedItems = allowedTargets.size ? collection.items.filter((item) => allowedTargets.has(`${item.targetType}:${item.targetId}`)) : collection.items;
  const targets: EvidenceTarget[] = scopedItems.slice(0, 30).map((item) => ({ ...item, eventIds: new Set(item.targetType === "EVENT" ? [item.targetId] : []) }));
  const digestTargets = targets.filter((item) => item.targetType === "DIGEST");
  const digests = digestTargets.length ? await prisma.digest.findMany({ where: { id: { in: digestTargets.map((item) => item.targetId) } }, select: { id: true, content: true } }) : [];
  for (const digest of digests) {
    const target = targets.find((item) => item.targetType === "DIGEST" && item.targetId === digest.id);
    if (target) for (const eventId of digestEventIds(digest.content)) target.eventIds.add(eventId);
  }

  // Filter frozen material dates before LIMIT, independently for every object.
  for (const target of targets) {
    const scope = target.targetType === "ENTITY"
      ? Prisma.sql`EXISTS (SELECT 1 FROM "EntityMention" m WHERE m."eventId" = e.id AND m."entityId" = ${target.targetId})`
      : target.eventIds.size ? Prisma.sql`e.id IN (${Prisma.join([...target.eventIds])})` : Prisma.sql`FALSE`;
    const lower = mode === "CHANGES_30D" ? Prisma.sql`AND stamp >= ${new Date(now.getTime() - 30 * 86_400_000)}` : Prisma.empty;
    const selected = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT e.id FROM "Event" e
      JOIN LATERAL (
        SELECT a."inputManifest", a."analyzedAt" FROM "Analysis" a
        WHERE a."eventId" = e.id AND a.status = 'AUTO_PUBLISHED' AND a."analyzedAt" <= ${now}
        ORDER BY a."analyzedAt" DESC, a.id DESC LIMIT 1
      ) a ON TRUE
      JOIN LATERAL (
        SELECT MAX(stamp) AS newest FROM (
          SELECT CASE WHEN item->>'publishedAt' IS NULL THEN a."analyzedAt"
            WHEN pg_input_is_valid(item->>'publishedAt', 'timestamp with time zone')
            THEN (item->>'publishedAt')::timestamptz END AS stamp
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a."inputManifest") = 'array' THEN a."inputManifest" ELSE '[]'::jsonb END) item
          UNION ALL SELECT a."analyzedAt" WHERE a."inputManifest" IS NULL OR a."inputManifest" = 'null'::jsonb OR a."inputManifest" = '[]'::jsonb
        ) dates WHERE stamp <= ${now} ${lower}
      ) dates ON dates.newest IS NOT NULL
      WHERE ${scope} ORDER BY dates.newest DESC, e.id ASC LIMIT 40
    `);
    target.eventIds = new Set(selected.map((event) => event.id));
  }
  const eventIds = [...new Set(targets.flatMap((target) => [...target.eventIds]))];
  const events = eventIds.length ? await prisma.event.findMany({
    where: { id: { in: eventIds }, analyses: { some: { status: "AUTO_PUBLISHED" } } },
    include: {
      analyses: { where: { status: "AUTO_PUBLISHED", analyzedAt: { lte: now } }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }], take: 1, include: { evidence: true } },
    },
  }) : [];
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const raw: ResearchAgentEvidence[] = [];
  let sequence = 0;

  for (const target of targets) {
    for (const eventId of target.eventIds) {
      const event = eventMap.get(eventId);
      if (!event) continue;
      const analysis = event.analyses[0];
      const manifest = frozenDocuments(analysis?.inputManifest);
      const citedDocuments = new Set<string>();
      for (const evidence of analysis?.evidence || []) {
        const document = manifest.find((item) => item.id === evidence.documentId);
        const located = document && locateFrozenQuote(analysis.id, document, evidence.quote);
        const sourceUrl = document && safeSourceUrl(document.url);
        if (!located || !document || !sourceUrl) continue;
        citedDocuments.add(evidence.documentId);
        raw.push({ id: `ev-${++sequence}`, targetType: target.targetType, targetId: target.targetId, targetTitle: target.targetTitle, eventId: event.id, eventTitle: event.title, documentId: document.id, documentTitle: document.title, sourceName: document.source, sourceUrl, ...located, stance: evidence.stance, occurredAt: document.publishedAt || analysis.analyzedAt.toISOString(), href: `/events/${encodeURIComponent(event.id)}` });
      }
      for (const document of manifest) {
        if (citedDocuments.has(document.id)) continue;
        const located = locateFrozenQuote(analysis.id, document);
        const sourceUrl = safeSourceUrl(document.url);
        if (!located || !sourceUrl) continue;
        raw.push({ id: `ev-${++sequence}`, targetType: target.targetType, targetId: target.targetId, targetTitle: target.targetTitle, eventId: event.id, eventTitle: event.title, documentId: document.id, documentTitle: document.title, sourceName: document.source, sourceUrl, ...located, stance: "CONTEXT", occurredAt: document.publishedAt || analysis.analyzedAt.toISOString(), href: `/events/${encodeURIComponent(event.id)}` });
      }
      if (!manifest.length && analysis) {
        raw.push({ id: `ev-${++sequence}`, targetType: target.targetType, targetId: target.targetId, targetTitle: target.targetTitle, eventId: event.id, eventTitle: event.title, documentId: null, documentTitle: "分析摘要（缺少冻结原文）", sourceName: "知线分析", sourceUrl: `/events/${encodeURIComponent(event.id)}`, quote: analysis.summary.slice(0, 700), sourceKind: "ANALYSIS_SUMMARY", stance: "CONTEXT", occurredAt: analysis.analyzedAt.toISOString(), href: `/events/${encodeURIComponent(event.id)}` });
      }
    }
  }

  const evidence = normalizeEvidence(filterEvidenceForMode(raw, mode, now.getTime()));
  const subjects = targets.map((item) => item.targetTitle);
  return { collection, subjects, evidence, outline: buildResearchOutline(mode, subjects, evidence.length, now), refusalReason: researchAgentRefusal(mode, subjects, evidence) };
}

async function requestModelAnswer(config: ResearchModelConfig, question: string, mode: ResearchAgentModeValue, subjects: string[], evidence: ResearchAgentEvidence[], fetchImpl: typeof fetch) {
  const response = await fetchImpl(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: "只能选择给定摘录，不改写或推断。claim 必须与对应 quote 完全相同，citations 仅含该 evidence id，kind 使用给定 claimKind，冲突不能写成 FACT。只输出 JSON，结构为 {version:'research-agent-answer-v1',title,summary,facts:[{claim,citations,kind}],limitations}。" },
        { role: "user", content: JSON.stringify({ question, mode, subjects, evidence: evidence.map((item) => ({ ...item, sourceSnapshot: undefined, claimKind: evidenceClaimKind(item) })) }) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2200,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `Research model returned HTTP ${response.status}`);
  const answer = parseResearchModelAnswer(result?.choices?.[0]?.message?.content, evidence);
  const safe = buildRuleBasedAnswer(question, mode, subjects, evidence);
  const conflicts = safe.facts.filter((fact) => fact.kind === "CONFLICT");
  return { ...safe, facts: [...conflicts, ...answer.facts.filter((fact) => fact.kind !== "CONFLICT")].slice(0, 16) };
}

export async function generateResearchAnswer(question: string, mode: ResearchAgentModeValue, subjects: string[], evidence: ResearchAgentEvidence[], options?: { config?: ResearchModelConfig | null; fetchImpl?: typeof fetch }) : Promise<{ answer: ResearchAgentAnswer; modelVersion: string; fallbackReason: string | null }> {
  let config: ResearchModelConfig | null = null;
  try { config = options && "config" in options ? options.config ?? null : configuredModel(); }
  catch { return { answer: buildRuleBasedAnswer(question, mode, subjects, evidence), modelVersion: "rules-v1", fallbackReason: "模型配置无效" }; }
  if (!config) return { answer: buildRuleBasedAnswer(question, mode, subjects, evidence), modelVersion: "rules-v1", fallbackReason: null };
  try {
    return { answer: await requestModelAnswer(config, question, mode, subjects, evidence, options?.fetchImpl || fetch), modelVersion: config.model, fallbackReason: null };
  } catch {
    return { answer: buildRuleBasedAnswer(question, mode, subjects, evidence), modelVersion: "rules-v1", fallbackReason: "模型不可用或输出未通过证据校验" };
  }
}

export function asEvidenceSnapshot(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value as unknown as ResearchAgentEvidence[] : [];
}
