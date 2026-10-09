import { getCurrentUser } from "@/lib/auth";
import { ensureDailyTask } from "@/lib/learning";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const task = await ensureDailyTask(user.id);
    return Response.json({ ok: true, taskId: task.id });
  } catch {
    return Response.json({ error: "学习任务生成失败，请稍后重试" }, { status: 500 });
  }
}
