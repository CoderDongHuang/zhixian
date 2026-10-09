"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const url = step === "request" ? "/api/auth/request-code" : "/api/auth/verify-code";
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(step === "request" ? { email, inviteCode } : { email, inviteCode, code }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setMessage(result.error ?? "请求失败，请稍后重试");
    if (step === "request") { setStep("verify"); setMessage("验证码已发送，有效期 10 分钟"); }
    else {
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next?.startsWith("/") ? next : "/onboarding");
    }
  }

  return <main className="auth-page"><section className="auth-panel">
    <p className="eyebrow">邀请测试</p><h1>登录知线</h1><p>输入邀请信息，开始建立你的 AI 行业信息流。</p>
    <form onSubmit={submit}>
      <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={step === "verify"} required /></label>
      <label>邀请码（新用户必填）<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} disabled={step === "verify"} /></label>
      {step === "verify" && <label>邮箱验证码<input inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} required /></label>}
      {message && <p className="form-message">{message}</p>}
      <button disabled={loading}>{loading ? "处理中..." : step === "request" ? "获取验证码" : "登录"}</button>
    </form>
  </section></main>;
}
