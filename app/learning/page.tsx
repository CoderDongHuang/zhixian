import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ensureDailyTask, ensureLearningPath } from "@/lib/learning";
import { parseLearningExercise, publicLearningExercise } from "@/lib/learning-policy";
import { prisma } from "@/lib/prisma";
import { TaskButton } from "./task-button";
import { RegenerateButton } from "./regenerate-button";
import { ReviewCard } from "./review-card";

export const dynamic = "force-dynamic";
type OutlineItem = { phase: string; objective: string; weeks: number; topics: string[] };

export default async function LearningPage() {
  const user = await getCurrentUser(); if (!user) redirect("/login?next=/learning");
  const path = await ensureLearningPath(user.id);
  const ensured = await ensureDailyTask(user.id);
  const [task, reviews, upcomingReviews] = await Promise.all([
    prisma.learningTask.findFirstOrThrow({ where: { id: ensured.id, userId: user.id }, include: { event: { select: { title: true } }, entity: { select: { id: true, name: true } }, prerequisite: { select: { title: true, completedAt: true } } } }),
    prisma.learningReview.findMany({ where: { userId: user.id, resolvedAt: null, dueAt: { lte: new Date() } }, include: { task: { select: { title: true } } }, orderBy: { dueAt: "asc" }, take: 6 }),
    prisma.learningReview.count({ where: { userId: user.id, resolvedAt: null, dueAt: { gt: new Date() } } }),
  ]);
  const outline = path.outline as OutlineItem[];
  const exercise = parseLearningExercise(task.exercise);
  const publicExercise = exercise ? publicLearningExercise(exercise) : null;
  return <main className="learning-shell"><header><Link href="/">← 返回信息流</Link><p className="eyebrow">AI 学习助手</p><h1>{path.title}</h1><p>{path.level}阶段 · 目标：{path.goal}</p>{path.stale && <p className="learning-notice">你的学习偏好已变化，建议重新规划路线。</p>}<div className="learning-meta"><span>{path.modelVersion === "rules-v1" ? "规则规划" : `AI 规划 · ${path.modelVersion}`}</span><span>{path.generatedAt.toLocaleString("zh-CN", { hour12: false })}</span><span>质量进度 {path.progress}%</span></div><p className="learning-reason">{path.generationReason}</p><RegenerateButton stale={path.stale} /><div className="progress" aria-label={`质量进度 ${path.progress}%`}><span style={{ width: `${path.progress}%` }} /></div></header>
    <section className="today-task"><div className="task-context"><span>今日建议 · {task.estimatedMinutes} 分钟 · {task.taskType === "CODE" ? "代码练习" : "事件实践"}</span><h2>{task.title}</h2><p>{task.description}</p><small>{task.reason}</small><div className="task-links">{task.eventId && <Link href={`/events/${task.eventId}`}>事件：{task.event?.title || "查看材料"}</Link>}{task.entityId && <Link href={`/entities/${task.entityId}`}>实体：{task.entity?.name || "查看实体"}</Link>}</div>{task.prerequisite && <p className={task.prerequisite.completedAt ? "prerequisite done" : "prerequisite"}>先修：{task.prerequisite.title} · {task.prerequisite.completedAt ? "已完成" : "未完成"}</p>}</div>{publicExercise ? <TaskButton id={task.id} exercise={publicExercise} taskType={task.taskType} initialCompleted={Boolean(task.completedAt)} initialQuality={task.qualityScore} blocked={Boolean(task.prerequisite && !task.prerequisite.completedAt)} /> : <p className="learning-notice">此旧任务没有知识检查，请重新规划路线后继续。</p>}</section>
    <section className="review-section"><header><div><p className="eyebrow">间隔复习</p><h2>待复习错题与知识点</h2></div><span>{reviews.length} 个到期 · {upcomingReviews} 个已排期</span></header>{reviews.length ? <div className="review-grid">{reviews.map((review) => <ReviewCard key={review.id} review={{ id: review.id, concept: review.concept, prompt: review.prompt, options: Array.isArray(review.options) ? review.options.filter((value): value is string => typeof value === "string") : [], taskTitle: review.task.title, repetition: review.repetition }} />)}</div> : <p className="empty-learning">当前没有到期复习，完成今日知识检查后会自动安排。</p>}</section>
    <section><h2>你的学习路线</h2><div className="learning-phases">{outline.map((item, index) => <article key={item.phase}><span>阶段 {index + 1} · {item.weeks} 周</span><h3>{item.phase}</h3><p>{item.objective}</p><ul>{item.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul></article>)}</div></section>
  </main>;
}
