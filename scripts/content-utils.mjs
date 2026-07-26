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

export function createClusterKey(title = "") {
  const stopWords = new Set(["the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "with", "from", "new", "introducing"]);
  const tokens = title.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, " ").split(/\s+/).filter((token) => token.length > 1 && !stopWords.has(token));
  const normalized = [...new Set(tokens)].sort().slice(0, 10).join(":") || title.toLowerCase().trim();
  return createHash("sha256").update(normalized).digest("hex");
}
