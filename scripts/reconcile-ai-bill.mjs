import { open } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { parseAiBill, reconcileAiBill } from "../lib/ai-reconciliation.mjs";

let db, file;
try {
  if (process.argv.length !== 3 || process.argv[2].startsWith("--")) throw new Error("AI_BILL_USAGE");
  file = await open(process.argv[2], "r");
  const info = await file.stat();
  if (!info.isFile() || info.size > 5 * 1024 * 1024) throw new Error("AI_BILL_INVALID_FILE");
  const buffer = Buffer.alloc(5 * 1024 * 1024 + 1);
  let size = 0;
  while (size < buffer.length) {
    const { bytesRead } = await file.read(buffer, size, buffer.length - size, size);
    if (!bytesRead) break;
    size += bytesRead;
  }
  if (size === buffer.length) throw new Error("AI_BILL_TOO_LARGE");
  const bill = parseAiBill(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size)));
  db = new PrismaClient();
  const calls = await db.aiCall.findMany({
    where: { provider: bill.provider, createdAt: { gte: bill.start, lt: bill.end } },
    select: { provider: true, model: true, providerRequestId: true, costUsd: true, pricingVersion: true, status: true, createdAt: true },
    take: 100001,
  });
  const report = reconcileAiBill(bill, calls);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "MATCHED") process.exitCode = 2;
} catch {
  // Never echo bill contents, filenames, provider errors or connection strings.
  console.error("AI bill reconciliation failed: check arguments, normalized USD bill, migration and database access. See docs/ai-budget-and-reconciliation.md.");
  process.exitCode = 1;
} finally {
  await file?.close();
  await db?.$disconnect();
}
