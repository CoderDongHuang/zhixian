import Link from "next/link";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token.mjs";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ user?: string; token?: string; result?: string }> }) {
  const params = await searchParams;
  let valid = false;
  try { valid = Boolean(params.user && params.token && verifyUnsubscribeToken(params.token, params.user)); } catch { valid = false; }
  const completed = params.result === "success" && valid;
  const invalid = !completed && !valid;
  return <main className="auth-page"><section className="auth-panel"><p className="eyebrow">邮件设置</p><h1>{completed ? "已停止邮件推送" : invalid ? "链接无效或已过期" : "停止接收行业简报？"}</h1><p>{completed ? "你仍可以登录网站阅读信息流，并在偏好设置中重新开启邮件。" : invalid ? "请使用最近 30 天内收到的简报邮件中的退订链接。" : "确认后将停止早报、晚报和周报邮件。"}</p>{valid && !completed && <form method="post" action="/api/unsubscribe"><input type="hidden" name="user" value={params.user} /><input type="hidden" name="token" value={params.token} /><button className="danger-button" type="submit">确认退订</button></form>}<p><Link href="/">返回首页</Link></p></section></main>;
}
