import { PrismaClient } from "@prisma/client";
import { trackedAiFetch } from "../lib/ai-telemetry.mjs";

const providers = [
  { name: "translation", key: process.env.AI_API_KEY, url: process.env.AI_API_URL, model: process.env.AI_MODEL },
  { name: "analysis", key: process.env.ANALYSIS_AI_API_KEY, url: process.env.ANALYSIS_AI_API_URL, model: process.env.ANALYSIS_AI_MODEL },
];

const db = new PrismaClient();
try {
  for (const provider of providers) {
    if (!provider.key || !provider.url || !provider.model) { console.log(`${provider.name}: disabled`); continue; }
    try {
      const response = await trackedAiFetch(db, `diagnostic-${provider.name}`, provider.model)(provider.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 8, temperature: 0 }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content?.trim() || result.choices?.[0]?.message?.reasoning_content?.trim();
      console.log(`${provider.name}: ${response.ok && content ? "connected" : `failed (${response.status})`}`);
      if (!response.ok || !content) process.exitCode = 1;
    } catch {
      console.error(`${provider.name}: failed (request or budget unavailable)`);
      process.exitCode = 1;
    }
  }
} finally { await db.$disconnect(); }
