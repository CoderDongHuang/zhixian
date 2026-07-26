import pg from "pg";

let sql = "";
for await (const chunk of process.stdin) sql += chunk;
if (!sql.trim()) throw new Error("No SQL received");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query(sql);
  console.log("Database schema applied successfully");
} finally {
  await client.end();
}
