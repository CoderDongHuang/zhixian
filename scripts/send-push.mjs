import { createHash } from "node:crypto";
import webpush from "web-push";
import { PrismaClient } from "@prisma/client";
import { MAX_PUSH_RETRIES, PUSH_CLAIM_TIMEOUT_MS, processClaimedPush } from "../lib/push-delivery.mjs";

const prisma = new PrismaClient();
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = "mailto:admin@example.com", APP_URL = "http://127.0.0.1:3000" } = process.env;

const digest = await prisma.digest.findFirst({ orderBy: { createdAt: "desc" } });
if (!digest) throw new Error("No digest available");
const subscriptions = await prisma.deviceSubscription.findMany({ include: { user: { include: { preference: true } } } });
if (subscriptions.some((item) => item.platform === "web")) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required for web subscriptions");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}
const summary = { digestId: digest.id, subscriptions: subscriptions.length, eligible: 0, claimed: 0, sent: 0, skipped: 0, failed: 0, expired: 0 };
const payload = JSON.stringify({ title: digest.title, body: digest.overview, url: `${APP_URL}/digests/${digest.id}` });

for (const subscription of subscriptions) {
  if (subscription.user.preference?.pushEnabled === false) { summary.skipped++; continue; }
  if (subscription.platform !== "web" && subscription.categories?.digest === false) { summary.skipped++; continue; }
  summary.eligible++;
  const endpointHash = createHash("sha256").update(subscription.endpoint).digest("hex");
  const delivery = await prisma.pushDelivery.upsert({
    where: { deviceId_digestId: { deviceId: subscription.id, digestId: digest.id } },
    update: {},
    create: { userId: subscription.userId, digestId: digest.id, deviceId: subscription.id, endpointHash },
  });
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PUSH_CLAIM_TIMEOUT_MS);
  const claim = await prisma.pushDelivery.updateMany({
    where: {
      id: delivery.id,
      retryCount: { lt: MAX_PUSH_RETRIES },
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { status: "PROCESSING", lastAttemptAt: { lt: staleBefore } },
      ],
    },
    data: { status: "PROCESSING", lastAttemptAt: now, retryCount: { increment: 1 } },
  });
  if (claim.count === 0) { summary.skipped++; continue; }
  summary.claimed++;
  const claimed = await prisma.pushDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  const outcome = await processClaimedPush({
    retryCount: claimed.retryCount,
    now,
    send: async () => {
      if (subscription.platform === "web") return webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
      const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ to: subscription.endpoint, title: digest.title, body: digest.overview, data: { url: `${APP_URL}/digests/${digest.id}`, digestId: digest.id } }) });
      const result = await response.json();
      if (!response.ok || result?.data?.status === "error") { const error = new Error(result?.data?.message || `Expo push failed (${response.status})`); error.statusCode = result?.data?.details?.error === "DeviceNotRegistered" ? 410 : response.status; throw error; }
      return { providerId: result?.data?.id || null };
    },
    markSent: ({ providerId, sentAt }) => prisma.pushDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", providerId, sentAt, error: null, nextAttemptAt: null } }),
    markFailed: ({ error, nextAttemptAt, attemptedAt }) => prisma.pushDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", error, nextAttemptAt, lastAttemptAt: attemptedAt } }),
    markExpired: ({ error, attemptedAt }) => prisma.pushDelivery.update({ where: { id: delivery.id }, data: { status: "EXPIRED", error, nextAttemptAt: null, lastAttemptAt: attemptedAt } }),
    invalidateDevice: async () => {
      await prisma.deviceSubscription.deleteMany({ where: { id: subscription.id } });
      const remaining = await prisma.deviceSubscription.count({ where: { userId: subscription.userId } });
      if (remaining === 0) await prisma.userPreference.update({ where: { userId: subscription.userId }, data: { pushEnabled: false } }).catch(() => undefined);
    },
  });
  summary[outcome]++;
}

console.log(JSON.stringify({ type: "push-delivery-summary", ...summary, timestamp: new Date().toISOString() }));
await prisma.$disconnect();
