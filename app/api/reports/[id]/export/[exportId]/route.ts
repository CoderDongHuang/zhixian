import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderReportDownload } from "@/lib/report-export";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; exportId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id, exportId } = await params;
  const reportExport = await prisma.reportExport.findFirst({ where: { id: exportId, digestId: id, userId: user.id }, include: { digest: true } });
  if (!reportExport || !reportExport.digest) return NextResponse.json({ error: "导出任务不存在" }, { status: 404 });
  return renderReportDownload(reportExport.digest, reportExport.template, reportExport.format);
}
