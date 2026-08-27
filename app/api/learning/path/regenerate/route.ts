import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { regenerateLearningPath } from "@/lib/learning";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const path = await regenerateLearningPath(user.id);
    return NextResponse.json({ ok: true, pathId: path.id, modelVersion: path.modelVersion });
  } catch {
    console.error(JSON.stringify({ type: "learning-regenerate-error", reason: "generation_failed" }));
    return NextResponse.json({ error: "路线生成失败，请稍后重试" }, { status: 500 });
  }
}
