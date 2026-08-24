import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const templates = new Set(["executive", "research", "learning"]);
const formats = new Set(["html", "markdown", "json"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const template = templates.has(body?.template) ? body.template as string : "executive";
  const format = formats.has(body?.format) ? body.format as string : "html";
  const idempotencyKey = request.headers.get("idempotency-key")?.trim().slice(0, 128) || null;
  if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return NextResponse.json({ error: "无效幂等键" }, { status: 400 });
  const digest = await prisma.digest.findFirst({ where: { id, OR: [{ userId: null }, { userId: user.id }] }, select: { id: true } });
  if (!digest) return NextResponse.json({ error: "报告不存在" }, { status: 404 });
  let reportExport = idempotencyKey ? await prisma.reportExport.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } } }) : null;
  if (!reportExport) {
    try { reportExport = await prisma.reportExport.create({ data: { userId: user.id, digestId: id, template, format, idempotencyKey } }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || !idempotencyKey) throw error;
      reportExport = await prisma.reportExport.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } } });
    }
  }
  if (!reportExport || reportExport.digestId !== id || reportExport.template !== template || reportExport.format !== format) return NextResponse.json({ error: "幂等键已用于其他导出" }, { status: 409 });
  return NextResponse.json({ downloadUrl: `/api/reports/${id}/export/${reportExport.id}` }, { status: 201 });
}
