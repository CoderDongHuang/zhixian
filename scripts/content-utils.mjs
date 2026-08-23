import { createHash } from "node:crypto";

const entities = /&(?:nbsp|amp|lt|gt|quot|#39);/gi;
const entityValues = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

export function cleanContent(input = "") {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(entities, (entity) => entityValues[entity.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50000);
}

export function detectLanguage(input = "") {
  const sample = input.slice(0, 2000);
  const chinese = (sample.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latin = (sample.match(/[a-z]/gi) ?? []).length;
  if (chinese > 20 && chinese / Math.max(chinese + latin, 1) > 0.15) return "ZH";
  if (latin > 20) return "EN";
  return "OTHER";
}

export function classifyTopic(title = "", content = "") {
  const text = `${title} ${content}`.toLowerCase();
  const scores = {
    "大模型": ["llm", "language model", "gpt", "claude", "gemini", "模型", "transformer", "inference", "推理"],
    "GitHub 开源项目": ["github", "open source", "repository", "开源", "repo", "developer tool", "copilot"],
    "AI 行业": ["artificial intelligence", " ai ", "agent", "openai", "anthropic", "人工智能", "融资", "policy", "regulation"],
  };
  let best = "AI 行业";
  let bestScore = -1;
  for (const [topic, keywords] of Object.entries(scores)) {
    const score = keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0);
    if (score > bestScore) { best = topic; bestScore = score; }
  }
  return best;
}

export function titleTokens(title = "") {
  const stopWords = new Set(["the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "with", "from", "new", "introducing"]);
  const aliases = new Map([
    ["acquires", "acquire"], ["acquired", "acquire"], ["acquisition", "acquire"], ["buys", "acquire"], ["bought", "acquire"],
    ["launches", "launch"], ["launched", "launch"], ["releases", "launch"], ["released", "launch"], ["introduces", "launch"], ["introduced", "launch"],
  ]);
  const parts = title.toLowerCase().normalize("NFKC").match(/[a-z0-9]+|[\u3400-\u9fff]+/g) || [];
  return parts
    .flatMap((part) => /[\u3400-\u9fff]/.test(part) && part.length > 2 ? Array.from({ length: part.length - 1 }, (_, index) => part.slice(index, index + 2)) : [part])
    .map((token) => aliases.get(token) || token)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function jaccard(left, right) {
  const a = new Set(left), b = new Set(right);
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

export function titleSimilarity(leftTitle, rightTitle) {
  const left = titleTokens(leftTitle), right = titleTokens(rightTitle);
  const leftPairs = left.slice(0, -1).map((token, index) => `${token}>${left[index + 1]}`);
  const rightPairs = right.slice(0, -1).map((token, index) => `${token}>${right[index + 1]}`);
  const directionWeight = left[0] && right[0] && left[0] !== right[0] ? 0.75 : 1;
  return (jaccard(left, right) * 0.7 + jaccard(leftPairs, rightPairs) * 0.3) * directionWeight;
}

export function bestTitleMatch(title, candidates, threshold = 0.65) {
  const best = candidates
    .map((event) => ({ event, score: titleSimilarity(title, event.title) }))
    .sort((left, right) => right.score - left.score)[0];
  return best && best.score >= threshold ? best : null;
}

export function createClusterKey(title = "") {
  const normalized = titleTokens(title).slice(0, 14).join(":") || title.toLowerCase().trim();
  return createHash("sha256").update(normalized).digest("hex");
}
