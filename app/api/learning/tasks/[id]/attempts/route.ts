import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { LearningSubmissionError, submitLearningTask } from "@/lib/learning-submission";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json(await submitLearningTask(user.id, id, body, request.headers.get("Idempotency-Key")));
  } catch (error) {
    if (error instanceof LearningSubmissionError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(JSON.stringify({ type: "learning-submission-failed", taskId: id }));
    return NextResponse.json({ error: "提交失败，请稍后重试" }, { status: 500 });
  }
}
