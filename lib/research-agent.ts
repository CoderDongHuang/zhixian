import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildResearchOutline,
  buildRuleBasedAnswer,
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
  return items.flatMap((item) => item && typeof item === "object" && typeof (item as { eventId?: unknown }).eventId === "string" ? [(item as { eventId: string }).eventId] : []).slice(0, 50);
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
  const entityTargets = targets.filter((item) => item.targetType === "ENTITY");
  const digestTargets = targets.filter((item) => item.targetType === "DIGEST");

  const [entities, digests] = await Promise.all([
    entityTargets.length ? prisma.entity.findMany({
      where: { id: { in: entityTargets.map((item) => item.targetId) } },
      select: { id: true, mentions: { take: 50, select: { eventId: true } } },
    }) : Promise.resolve([]),
    digestTargets.length ? prisma.digest.findMany({ where: { id: { in: digestTargets.map((item) => item.targetId) } }, select: { id: true, content: true } }) : Promise.resolve([]),
  ]);

  for (const entity of entities) {
    const target = targets.find((item) => item.targetType === "ENTITY" && item.targetId === entity.id);
    if (target) for (const mention of entity.mentions) if (mention.eventId) target.eventIds.add(mention.eventId);
  }
  for (const digest of digests) {
    const target = targets.find((item) => item.targetType === "DIGEST" && item.targetId === digest.id);
    if (target) for (const eventId of digestEventIds(digest.content)) target.eventIds.add(eventId);
  }

  const eventIds = [...new Set(targets.flatMap((target) => [...target.eventIds]))].slice(0, 120);
  const events = eventIds.length ? await prisma.event.findMany({
    where: { id: { in: eventIds }, analyses: { some: { status: "AUTO_PUBLISHED" } } },
    include: {
      analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1, include: { evidence: { include: { document: { include: { source: true } } } } } },
      documents: { include: { document: { include: { source: true } } } },
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
      const citedDocuments = new Set<string>();
      for (const evidence of analysis?.evidence || []) {
        const sourceUrl = safeSourceUrl(evidence.document.url);
        if (!sourceUrl) continue;
        citedDocuments.add(evidence.documentId);
        raw.push({ id: `ev-${++sequence}`, targetType: target.targetType, targetId: target.targetId, targetTitle: target.targetTitle, eventId: event.id, eventTitle: event.title, documentId: evidence.documentId, documentTitle: evidence.document.title, sourceName: evidence.document.source.name, sourceUrl, quote: evidence.quote || analysis.summary, stance: evidence.stance, occurredAt: (evidence.document.publishedAt || evidence.document.fetchedAt || event.createdAt).toISOString(), href: `/events/${encodeURIComponent(event.id)}` });
      }
      for (const { document } of event.documents) {
        if (citedDocuments.has(document.id)) continue;
        const sourceUrl = safeSourceUrl(document.url);
        if (!sourceUrl) continue;
        raw.push({ id: `ev-${++sequence}`, targetType: target.targetType, targetId: target.targetId, targetTitle: target.targetTitle, eventId: event.id, eventTitle: event.title, documentId: document.id, documentTitle: document.title, sourceName: document.source.name, sourceUrl, quote: analysis?.summary || event.title, stance: "CONTEXT", occurredAt: (document.publishedAt || document.fetchedAt || event.createdAt).toISOString(), href: `/events/${encodeURIComponent(event.id)}` });
      }
    }
  }

  const evidence = filterEvidenceForMode(normalizeEvidence(raw), mode, now.getTime());
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
        { role: "system", content: "你是严谨的中文研究代理。只能使用给定证据，不得补充外部事实。每个事实至少引用一个 evidence id；推测必须标记 INFERENCE。只输出 JSON，结构为 {version:'research-agent-answer-v1',title,summary,facts:[{claim,citations,kind}],limitations}。" },
        { role: "user", content: JSON.stringify({ question, mode, subjects, evidence }) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2200,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `Research model returned HTTP ${response.status}`);
  const answer = parseResearchModelAnswer(result?.choices?.[0]?.message?.content, evidence.map((item) => item.id));
  return { ...answer, summary: `报告仅依据专题内冻结的 ${evidence.length} 条证据生成；以下事实和推测均可回溯到对应文档或事件。` };
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
