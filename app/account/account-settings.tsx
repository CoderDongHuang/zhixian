"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountAvatar } from "@/app/account-avatar";

async function accountRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/account/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "保存失败，请稍后重试");
  return result;
}

function CodeInput({ label, purpose, email, value, onChange, disabled }: { label: string; purpose: string; email: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const id = useId();
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!seconds) return;
    const timer = window.setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);
  async function send() {
    setSending(true); setMessage("");
    try { await accountRequest("code", { purpose, email }); setSeconds(60); setMessage("验证码已发送，10 分钟内有效。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "发送失败，请重试"); }
    finally { setSending(false); }
  }
  return <div className="account-code">
    <label htmlFor={id}>{label}</label><div className="account-code-row"><input id={id} value={value} onChange={event => onChange(event.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={disabled} /><button type="button" className="secondary" aria-label={`发送${label}`} onClick={send} disabled={disabled || sending || seconds > 0 || !email}>{sending ? "发送中…" : seconds > 0 ? `${seconds} 秒后重发` : "获取验证码"}</button></div>
    {message && <p className="setting-message" role="status">{message}</p>}
  </div>;
}

export function AccountSettings({ userId, email, hasPassword }: { userId: string; email: string | null; hasPassword: boolean }) {
  const router = useRouter();
  const upload = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordCode, setPasswordCode] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  async function saveAvatar(file?: File) {
    if (file && (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024)) { setAvatarMessage("请选择不超过 2 MB 的 JPG、PNG 或 WebP 图片。"); return; }
    setAvatarBusy(true); setAvatarMessage("");
    try {
      const response = await fetch("/api/account/avatar", { method: file ? "POST" : "DELETE", headers: file ? { "Content-Type": file.type } : undefined, body: file, signal: AbortSignal.timeout(25_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "头像保存失败");
      window.dispatchEvent(new Event("account-avatar-updated"));
      setAvatarMessage(file ? "头像已更新。" : "已恢复默认头像。");
    } catch (error) { setAvatarMessage(error instanceof Error ? error.message : "头像保存失败，请重试"); }
    finally { setAvatarBusy(false); if (upload.current) upload.current.value = ""; }
  }

  async function saveEmail(event: FormEvent) {
    event.preventDefault(); setEmailBusy(true); setEmailMessage("");
    try {
      await accountRequest("email", { email: newEmail, currentCode, newCode });
      setCurrentCode(""); setNewCode(""); setNewEmail(""); setPasswordCode("");
      setEmailMessage("邮箱已更新，下次请使用新邮箱登录。其他设备已退出登录。");
      router.refresh();
    } catch (error) { setEmailMessage(error instanceof Error ? error.message : "更新失败，请重试"); }
    finally { setEmailBusy(false); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault(); setPasswordMessage("");
    if (password !== confirmation) { setPasswordMessage("两次输入的密码不一致。"); return; }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) { setPasswordMessage("密码需要同时包含英文字母和数字。"); return; }
    setPasswordBusy(true);
    try {
      await accountRequest("password", { password, code: passwordCode });
      setPassword(""); setConfirmation(""); setPasswordCode(""); setCurrentCode(""); setNewCode("");
      setPasswordMessage("密码已保存，可使用邮箱和密码登录。其他设备已退出登录。");
      router.refresh();
    } catch (error) { setPasswordMessage(error instanceof Error ? error.message : "更新失败，请重试"); }
    finally { setPasswordBusy(false); }
  }

  const busy = emailBusy || passwordBusy;
  return <section className="account-settings" aria-label="账号设置">
    <div className="account-setting-card avatar-setting">
      <div><p className="eyebrow">个人资料</p><h2>头像</h2><p>让你的账号更有辨识度。</p></div>
      <div className="avatar-setting-controls"><AccountAvatar userId={userId} email={email} /><div><div className="setting-actions"><button type="button" onClick={() => upload.current?.click()} disabled={avatarBusy}>{avatarBusy ? "保存中…" : "上传头像"}</button><button type="button" className="secondary" disabled={avatarBusy} onClick={() => saveAvatar()}>恢复默认</button></div><p className="setting-help">JPG、PNG 或 WebP，最大 2 MB；将自动裁剪为正方形。</p><input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择头像图片" className="avatar-file-input" onChange={event => { const file = event.target.files?.[0]; if (file) void saveAvatar(file); }} /></div></div>
      {avatarMessage && <p className="setting-message" role="status">{avatarMessage}</p>}
    </div>
    <div className="account-settings-grid">
      <form className="account-setting-card" onSubmit={saveEmail} aria-label="更换邮箱">
        <div><p className="eyebrow">登录方式</p><h2>{email ? "重新绑定邮箱" : "绑定邮箱"}</h2><p>当前邮箱：<strong>{email || "尚未绑定"}</strong></p></div>
        {email && <CodeInput key={`current:${email}`} label="原邮箱验证码" purpose="email-current" email={email} value={currentCode} onChange={setCurrentCode} disabled={busy} />}
        <label>新邮箱<input type="email" autoComplete="email" maxLength={254} value={newEmail} onChange={event => { setNewEmail(event.target.value); setNewCode(""); }} required disabled={busy} placeholder="输入要绑定的新邮箱" /></label>
        <CodeInput label="新邮箱验证码" purpose="email-new" email={newEmail} value={newCode} onChange={setNewCode} disabled={busy} />
        <p className="setting-help">{email ? "需验证原邮箱和新邮箱。" : "验证新邮箱后即可绑定。"}收藏、阅读记录和偏好会保留。</p>
        <button type="submit" disabled={busy}>{emailBusy ? "保存中…" : "保存邮箱"}</button>
        {emailMessage && <p className="setting-message" role="status">{emailMessage}</p>}
      </form>
      <form className="account-setting-card" onSubmit={savePassword} aria-label="设置登录密码">
        <div><p className="eyebrow">账号安全</p><h2>{hasPassword ? "更改密码" : "设置登录密码"}</h2><p>{email ? "验证当前邮箱后设置新密码，忘记原密码也可修改。" : "请先绑定邮箱，再设置登录密码。"}</p></div>
        <CodeInput key={`password:${email}`} label="当前邮箱验证码" purpose="password" email={email || ""} value={passwordCode} onChange={setPasswordCode} disabled={busy || !email} />
        <label>新密码<input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy || !email} /></label>
        <label>确认新密码<input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={busy || !email} /></label>
        <p className="setting-help">10–128 位，包含英文字母和数字。修改邮箱或密码后，其他设备需重新登录。</p>
        <button type="submit" disabled={busy || !email}>{passwordBusy ? "保存中…" : "保存密码"}</button>
        {passwordMessage && <p className="setting-message" role="status">{passwordMessage}</p>}
      </form>
    </div>
  </section>;
}
