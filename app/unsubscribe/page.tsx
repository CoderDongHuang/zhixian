import Link from "next/link";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ user?: string; token?: string; confirmed?: string }> }) {
  const params = await searchParams; const expected = createHash("sha256").update(`${process.env.AUTH_SECRET}:unsubscribe:${params.user || ""}`).digest("hex");
  const valid = Boolean(params.user && params.token && params.token.length === expected.length && timingSafeEqual(Buffer.from(params.token), Buffer.from(expected)));
  if (valid && params.confirmed === "1") await prisma.userPreference.updateMany({ where: { userId: params.user }, data: { emailEnabled: false } });
  return <main className="auth-page"><section className="auth-panel"><p className="eyebrow">邮件设置</p><h1>{!valid ? "链接无效" : params.confirmed === "1" ? "已停止邮件推送" : "停止接收行业简报？"}</h1><p>{!valid ? "这个退订链接无效或不完整。" : params.confirmed === "1" ? "你仍可以登录网站阅读信息流，并在偏好设置中重新开启邮件。" : "确认后将停止早报、晚报和周报邮件。"}</p>{valid && params.confirmed !== "1" && <Link className="confirm-link" href={`/unsubscribe?user=${encodeURIComponent(params.user!)}&token=${encodeURIComponent(params.token!)}&confirmed=1`}>确认退订</Link>}<p><Link href="/">返回首页</Link></p></section></main>;
}
