export async function sendLoginCode(email: string, code: string) {
  if (!process.env.EMAIL_API_KEY || !process.env.EMAIL_FROM) {
    if (process.env.NODE_ENV === "production") throw new Error("Email service is not configured");
    console.info(`[auth] Login code for ${email}: ${code}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `知线 <${process.env.EMAIL_FROM}>`,
      to: [email],
      subject: "你的知线登录验证码",
      html: `<p>你的登录验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 10 分钟内有效，请勿转发。</p>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend request failed: ${response.status} ${detail}`);
  }
}
