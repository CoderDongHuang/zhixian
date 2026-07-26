import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

try {
  await client.connect();
  const result = await client.query("select current_database() as database, current_user as user");
  const counts = await client.query(`select
    (select count(*) from "Source") as sources,
    (select count(*) from "RawDocument") as documents,
    (select count(*) from "Invitation") as invitations,
    (select count(*) from "Event") as events,
    (select count(*) from "Analysis") as analyses,
    (select count(*) from "FeedItem") as feed_items,
    (select count(*) from "Analysis" where status = 'PENDING_REVIEW') as pending_review,
    (select count(*) from "RawDocument" where "processingStatus" = 'WAITING_TRANSLATION') as waiting_translation,
    (select count(*) from "RawDocument" where "processingStatus" = 'PROCESSED') as processed`);
  console.log(result.rows, counts.rows);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
