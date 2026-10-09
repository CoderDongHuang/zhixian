import { parseAuthInput } from "@/lib/auth-input";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRefreshToken, exchangeWechatCode, miniRefreshExpiry, refreshTokenHash, tokenResponse } from "@/lib/mini-auth";

export async function POST(request: Request) {
  const body = await parseAuthInput(request, "wechat");
  if (!body) return NextResponse.json({ error: "认证请求格式无效" }, { status: 400 });
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const deviceId = body.deviceId;
  if (!code || !deviceId) return NextResponse.json({ error: "code and deviceId are required" }, { status: 400 });
  try {
    const identity = await exchangeWechatCode(code);
    const refreshToken = createRefreshToken();
    const result = await prisma.$transaction(async (tx) => {
      let wechat = await tx.wechatIdentity.findUnique({ where: { appId_openId: { appId: process.env.WECHAT_APP_ID!, openId: identity.openId } }, include: { user: true } });
      if (!wechat) {
        const user = await tx.user.create({ data: { preference: { create: { topics: ["AI 行业", "大模型", "GitHub 开源项目"] } } } });
        wechat = await tx.wechatIdentity.create({ data: { userId: user.id, appId: process.env.WECHAT_APP_ID!, openId: identity.openId, unionId: identity.unionId }, include: { user: true } });
      } else if (identity.unionId && identity.unionId !== wechat.unionId) {
        wechat = await tx.wechatIdentity.update({ where: { id: wechat.id }, data: { unionId: identity.unionId }, include: { user: true } });
      }
      const session = await tx.miniSession.upsert({
        where: { userId_deviceId: { userId: wechat.userId, deviceId } },
        update: { refreshTokenHash: refreshTokenHash(refreshToken), expiresAt: miniRefreshExpiry(), revokedAt: null },
        create: { userId: wechat.userId, deviceId, refreshTokenHash: refreshTokenHash(refreshToken), expiresAt: miniRefreshExpiry() },
      });
      return { user: wechat.user, session };
    });
    return NextResponse.json({ ...tokenResponse(result.user.id, result.session.id, refreshToken), account: { linked: Boolean(result.user.email), email: result.user.email } });
  } catch (error) {
    console.warn(JSON.stringify({ type: "wechat-login-failed", error: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: "WeChat login failed" }, { status: 401 });
  }
}
