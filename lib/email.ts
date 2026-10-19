export async function sendLoginCode(email: string, code: string, options: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; purpose?: string } = {}) {
  const env = options.env ?? process.env;
  if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
    if (env.NODE_ENV === "production") throw new Error("Email service is not configured");
    console.info(`[auth] Login code for ${email}: ${code}`);
    return;
  }

  const response = await (options.fetch ?? fetch)("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `知线 <${env.EMAIL_FROM}>`,
      to: [email],
      subject: `你的知线${options.purpose || "登录"}验证码`,
      html: `<p>你的${options.purpose || "登录"}验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 10 分钟内有效，请勿转发。</p>`,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend request failed: ${response.status} ${detail}`);
  }
}
