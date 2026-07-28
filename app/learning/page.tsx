import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ensureDailyTask, ensureLearningPath } from "@/lib/learning";
import { TaskButton } from "./task-button";
import { RegenerateButton } from "./regenerate-button";

export const dynamic = "force-dynamic";
type OutlineItem = { phase: string; objective: string; weeks: number; topics: string[] };

export default async function LearningPage() {
  const user = await getCurrentUser(); if (!user) redirect("/login?next=/learning");
  const path = await ensureLearningPath(user.id);
  const task = await ensureDailyTask(user.id);
  const outline = path.outline as OutlineItem[];
  return <main className="learning-shell"><header><Link href="/">← 返回信息流</Link><p className="eyebrow">AI 学习助手</p><h1>{path.title}</h1><p>{path.level}阶段 · 目标：{path.goal}</p>{path.stale && <p className="learning-notice">你的学习偏好已变化，建议重新规划路线。</p>}<div className="learning-meta"><span>{path.modelVersion === "rules-v1" ? "规则规划" : `AI 规划 · ${path.modelVersion}`}</span><span>{path.generatedAt.toLocaleString("zh-CN", { hour12: false })}</span></div><p className="learning-reason">{path.generationReason}</p><RegenerateButton stale={path.stale} /><div className="progress"><span style={{ width: `${path.progress}%` }} /></div></header>
    <section className="today-task"><div><span>今日建议 · {task.estimatedMinutes} 分钟</span><h2>{task.title}</h2><p>{task.description}</p><small>{task.reason}</small>{task.eventId && <p><Link href={`/events/${task.eventId}`}>开始精读 →</Link></p>}</div><TaskButton id={task.id} initialCompleted={Boolean(task.completedAt)} /></section>
    <section><h2>你的学习路线</h2><div className="learning-phases">{outline.map((item, index) => <article key={item.phase}><span>阶段 {index + 1} · {item.weeks} 周</span><h3>{item.phase}</h3><p>{item.objective}</p><ul>{item.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul></article>)}</div></section>
  </main>;
}
