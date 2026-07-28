import webpush from "web-push";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = "mailto:admin@example.com", APP_URL = "http://127.0.0.1:3000" } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required");
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const latest = await prisma.digest.findFirst({ orderBy: { createdAt: "desc" } });
if (!latest) throw new Error("No digest available");
const subscriptions = await prisma.deviceSubscription.findMany({ include: { user: { include: { preference: true } } } });
for (const item of subscriptions.filter((item) => item.user.preference?.pushEnabled !== false)) {
  try {
    await webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, JSON.stringify({ title: latest.title, body: latest.overview, url: `${APP_URL}/digests/${latest.id}` }));
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) await prisma.deviceSubscription.delete({ where: { id: item.id } });
    else console.error(item.id, error?.message || error);
  }
}
await prisma.$disconnect();
