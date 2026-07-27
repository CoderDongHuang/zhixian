import { createHash } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const model = process.env.EMBEDDING_MODEL || "text-embedding-v3";
const dimensions = Number(process.env.EMBEDDING_DIMENSIONS || 1024);
if (!process.env.EMBEDDING_API_KEY || !process.env.EMBEDDING_API_URL) throw new Error("Embedding configuration is incomplete");
const client = await pool.connect();
try {
  const { rows } = await client.query(`select id, title, coalesce("cleanedContent", content, '') as content from "RawDocument" where id not in (select "documentId" from "Embedding" where "documentId" is not null) order by "fetchedAt" asc limit $1`, [Number(process.env.EMBEDDING_BATCH_SIZE || 25)]);
  let created = 0;
  for (const row of rows) {
    const text = `${row.title}\n\n${String(row.content).slice(0, 12000)}`;
    const contentHash = createHash("sha256").update(`${model}:${text}`).digest("hex");
    const response = await fetch(process.env.EMBEDDING_API_URL, { method: "POST", headers: { Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [text], dimensions }), signal: AbortSignal.timeout(60000) });
    const result = await response.json(); if (!response.ok) throw new Error(result?.error?.message || `Embedding HTTP ${response.status}`);
    const vector = result.data?.[0]?.embedding; if (!Array.isArray(vector)) throw new Error("Embedding response missing vector");
    await client.query(`insert into "Embedding" (id, document_id, content_hash, model, dimensions, vector, created_at) values (gen_random_uuid()::text, $1, $2, $3, $4, $5::vector, now()) on conflict (content_hash) do nothing`, [row.id, contentHash, model, dimensions, `[${vector.join(",")}]`]);
    created++;
  }
  console.log({ total: rows.length, created });
} finally { client.release(); await pool.end(); }
