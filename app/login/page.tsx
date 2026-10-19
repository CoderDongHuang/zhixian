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
  const [mode, setMode] = useState<"code" | "password">("code");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const url = mode === "password" ? "/api/auth/password" : step === "request" ? "/api/auth/request-code" : "/api/auth/verify-code";
    try {
      const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "password" ? { email, password } : step === "request" ? { email, inviteCode } : { email, inviteCode, code }) });
      const result = await response.json();
      if (!response.ok) { setMessage(typeof result?.error === "string" ? result.error : "请求失败，请稍后重试"); return; }
      if (mode === "code" && step === "request") { setStep("verify"); setMessage("验证码已发送，有效期 10 分钟"); }
      else {
        const next = new URLSearchParams(window.location.search).get("next");
        // Only navigate within this origin, including when a next value is crafted.
        const target = next ? new URL(next, window.location.origin) : null;
        router.push(target?.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : "/onboarding");
        router.refresh();
      }
    } catch {
      setMessage(mode === "password" ? "登录请求失败，请检查网络后重试。" : step === "request" ? "未能确认验证码是否发送，请检查网络后重试；如已收到邮件，可使用最新验证码。" : "未能确认登录结果，请检查网络后重试；若验证码已失效，请重新获取。");
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><section className="auth-panel">
    <p className="eyebrow">邀请测试</p><h1>登录知线</h1><p>输入邀请信息，开始建立你的 AI 行业信息流。</p>
    <div className="login-methods" aria-label="登录方式">{([["code", "验证码登录"], ["password", "密码登录"]] as const).map(([value, label]) => <button key={value} type="button" className={mode === value ? "" : "secondary"} aria-pressed={mode === value} disabled={loading} onClick={() => { setMode(value); setStep("request"); setMessage(""); setCode(""); setPassword(""); }}>{label}</button>)}</div>
    <form onSubmit={submit}>
      <label>邮箱<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} disabled={step === "verify" || loading} required /></label>
      {mode === "code" && <label>邀请码（新用户必填）<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} disabled={step === "verify" || loading} /></label>}
      {mode === "code" && step === "verify" && <label>邮箱验证码<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} required /></label>}
      {mode === "password" && <label>密码<input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required disabled={loading} /></label>}
      {message && <p className="form-message" role="status" aria-live="polite">{message}</p>}
      <button type="submit" disabled={loading}>{loading ? "处理中..." : mode === "code" && step === "request" ? "获取验证码" : "登录"}</button>
      {mode === "code" && step === "verify" && <button type="button" className="secondary" disabled={loading} onClick={() => { setStep("request"); setCode(""); setMessage(""); }}>重新获取验证码</button>}
      {mode === "password" && <p className="setting-help">尚未设置或忘记密码？请使用验证码登录，再到个人中心设置密码。</p>}
    </form>
  </section></main>;
}
