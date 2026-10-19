import sharp from "sharp";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { accountContext, accountError, accountFailure } from "@/lib/account-route";
import { requireUnchangedAccount } from "@/lib/account-storage";
import { enforceAuthLimits } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const profile = await prisma.accountProfile.findUnique({ where: { userId: user.id }, select: { avatar: true } });
  return new Response(profile?.avatar ? new Uint8Array(profile.avatar) : null, { status: profile?.avatar ? 200 : 404, headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

async function changeAvatar(request: Request, remove: boolean) {
  const context = await accountContext(request);
  if (context.error) return context.error;
  if (await enforceAuthLimits([{ scope: "account-avatar", subject: context.user.id, limit: 20, windowMs: 3_600_000, blockMs: 60_000 }])) return accountError("上传过于频繁，请稍后再试", 429);
  let avatar: Uint8Array | null = null;
  if (!remove) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(request.headers.get("content-type") || "")) return accountError("请选择 JPG、PNG 或 WebP 图片", 415);
    const reader = request.body?.getReader();
    if (!reader) return accountError("请选择头像图片");
    try {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); return accountError("图片不能超过 2 MB", 413); }
        chunks.push(value);
      }
      const input = Buffer.concat(chunks);
      const pipeline = sharp(input, { limitInputPixels: 20_000_000, animated: false });
      const metadata = await pipeline.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1) return accountError("请选择静态 JPG、PNG 或 WebP 图片", 415);
      avatar = new Uint8Array(await pipeline.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 82 }).toBuffer());
    } catch { return accountError("图片无法读取，请更换图片"); }
  }
  try {
    await prisma.$transaction(async tx => {
      await requireUnchangedAccount(tx, context.user.id, context.user.email, context.tokenHash);
      await tx.accountProfile.upsert({ where: { userId: context.user.id }, create: { userId: context.user.id, avatar }, update: { avatar } });
    });
  } catch (error) { return accountFailure(error); }
  return NextResponse.json({ ok: true });
}

export const POST = (request: Request) => changeAvatar(request, false);
export const DELETE = (request: Request) => changeAvatar(request, true);
