function stripCodeFence(value = "") {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export async function callModel({ key, url, model, system, user, maxTokens = 1600 }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.1, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(90000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? `Model returned HTTP ${response.status}`);
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("Model returned empty content");
  try { return JSON.parse(stripCodeFence(content)); }
  catch { throw new Error("Model returned invalid JSON"); }
}
