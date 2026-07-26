const providers = [
  { name: "translation", key: process.env.AI_API_KEY, url: process.env.AI_API_URL, model: process.env.AI_MODEL },
  { name: "analysis", key: process.env.ANALYSIS_AI_API_KEY, url: process.env.ANALYSIS_AI_API_URL, model: process.env.ANALYSIS_AI_MODEL },
];

for (const provider of providers) {
  try {
    const response = await fetch(provider.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 8, temperature: 0 }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim() || result.choices?.[0]?.message?.reasoning_content?.trim();
    console.log(`${provider.name}: ${response.ok && content ? "connected" : `failed (${response.status})`}`);
    if (!response.ok) console.error(result?.error?.message ?? "Unknown provider error");
    else if (!content) console.error(`Unexpected choice fields: ${Object.keys(result.choices?.[0] ?? {}).join(", ")}; message fields: ${Object.keys(result.choices?.[0]?.message ?? {}).join(", ")}`);
  } catch (error) {
    console.error(`${provider.name}: failed (${error.message})`);
  }
}
