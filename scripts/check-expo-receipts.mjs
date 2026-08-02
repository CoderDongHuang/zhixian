import { PrismaClient } from "@prisma/client";
import { classifyExpoReceipt } from "../lib/expo-receipts.mjs";

const prisma = new PrismaClient();
const candidates = await prisma.pushDelivery.findMany({ where: { status: "SENT", providerId: { not: null }, receiptCheckedAt: null }, orderBy: { sentAt: "asc" }, take: 300 });
const summary = { checked: 0, delivered: 0, failed: 0, expired: 0 };
for (let offset = 0; offset < candidates.length; offset += 100) {
  const batch = candidates.slice(offset, offset + 100);
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ids: batch.map((item) => item.providerId) }) });
  if (!response.ok) throw new Error(`Expo receipt request failed (${response.status})`);
  const receipts = (await response.json()).data || {};
  for (const delivery of batch) {
    const receipt = receipts[delivery.providerId];
    const outcome = classifyExpoReceipt(receipt);
    if (outcome.state === "pending") continue;
    summary.checked++;
    if (outcome.state === "delivered") { summary.delivered++; await prisma.pushDelivery.update({ where: { id: delivery.id }, data: { receiptStatus: outcome.code, receiptCheckedAt: new Date(), error: null } }); continue; }
    const deviceExpired = outcome.state === "expired";
    summary[deviceExpired ? "expired" : "failed"]++;
    await prisma.pushDelivery.update({ where: { id: delivery.id }, data: { status: deviceExpired ? "EXPIRED" : "FAILED", receiptStatus: outcome.code, receiptCheckedAt: new Date(), error: outcome.message } });
    if (deviceExpired) await prisma.deviceSubscription.deleteMany({ where: { id: delivery.deviceId } });
  }
}
console.log(JSON.stringify({ type: "expo-push-receipts", ...summary, timestamp: new Date().toISOString() }));
await prisma.$disconnect();
