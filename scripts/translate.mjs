import { currentPipelineTask } from "../lib/pipeline-tasks.mjs";
import { trackedAiFetch } from "../lib/ai-telemetry.mjs";
import { modelHttpError, providerOptions } from "../lib/free-quota-policy.mjs";

export async function translateToChinese(text) {
  if (!process.env.AI_API_KEY || !process.env.AI_API_URL || !process.env.AI_MODEL) return null;
  const task = currentPipelineTask();
  if (!task) throw new Error("Translation must run inside a pipeline task");
  const response = await trackedAiFetch(task.db, "translation", process.env.AI_MODEL)(process.env.AI_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.AI_MODEL, messages: [
      { role: "system", content: "Translate technical content into accurate Simplified Chinese. Preserve code, product names, API names, model names, URLs, and common English abbreviations. Return only the translation." },
      { role: "user", content: text.slice(0, 12000) },
    ], temperature: 0.1, max_tokens: 2400, ...providerOptions(process.env.AI_API_URL) }),
    redirect: "error",
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json();
  if (!response.ok) throw modelHttpError(response.status, result);
  return result.choices?.[0]?.message?.content?.trim() || null;
}
