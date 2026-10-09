import type { ResearchAgentEvidence } from "./research-agent-policy";

export type FrozenDocument = { id: string; revision: number; contentHash: string; title: string; url: string; source: string; publishedAt: string | null; content: string };

export function frozenDocuments(value: unknown): FrozenDocument[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is FrozenDocument => item && typeof item === "object" && typeof item.id === "string"
    && Number.isInteger(item.revision) && item.revision >= 0 && typeof item.contentHash === "string" && Boolean(item.contentHash)
    && typeof item.title === "string" && typeof item.url === "string" && typeof item.source === "string" && typeof item.content === "string"
    && (item.publishedAt === null || typeof item.publishedAt === "string"));
}

export function locateFrozenQuote(analysisId: string, document: FrozenDocument, requestedQuote?: string): Pick<ResearchAgentEvidence, "quote" | "sourceKind" | "sourceSnapshot"> | null {
  const quote = (requestedQuote ?? document.content).trim().slice(0, 700);
  const quoteStart = document.content.indexOf(quote);
  if (!quote || quoteStart < 0) return null;
  return { quote, sourceKind: "ORIGINAL", sourceSnapshot: { analysisId, revision: document.revision, contentHash: document.contentHash, text: document.content, quoteStart, quoteEnd: quoteStart + quote.length } };
}
