import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, ResearchAgentMode, ResearchAgentStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ResearchAgentAnswer, ResearchAgentEvidence, ResearchAgentOutline } from "@/lib/research-agent-policy";
import { AgentTaskActions, AgentTaskCreator } from "./agent-controls";

export const dynamic = "force-dynamic";

const statusLabels: Record<ResearchAgentStatus, string> = { AWAITING_CONFIRMATION: "等待确认", RUNNING: "生成中", COMPLETED: "已完成", REFUSED: "已拒答", FAILED: "失败", CANCELLED: "已取消" };
const modeLabels: Record<ResearchAgentMode, string> = { QUESTION: "专题问答", COMPARE: "对象比较", CHANGES_30D: "过去 30 天" };

function asOutline(value: Prisma.JsonValue): ResearchAgentOutline | null {
  return value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { steps?: unknown }).steps) ? value as unknown as ResearchAgentOutline : null;
}

function asEvidence(value: Prisma.JsonValue): ResearchAgentEvidence[] {
  return Array.isArray(value) ? value as unknown as ResearchAgentEvidence[] : [];
}

function asAnswer(value: Prisma.JsonValue | null): ResearchAgentAnswer | null {
  return value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { facts?: unknown }).facts) ? value as unknown as ResearchAgentAnswer : null;
}

export default async function ResearchAgentPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/research/agent");
  const requestedTask = (await searchParams).task;
  const [collections, tasks] = await Promise.all([
    prisma.researchCollection.findMany({ where: { userId: user.id }, select: { id: true, title: true, items: { orderBy: { createdAt: "asc" }, select: { targetType: true, targetId: true, targetTitle: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.researchAgentTask.findMany({ where: { userId: user.id }, select: { id: true, question: true, mode: true, status: true, createdAt: true, collection: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const selectedId = requestedTask || tasks[0]?.id;
  const selected = selectedId ? await prisma.researchAgentTask.findFirst({ where: { id: selectedId, userId: user.id }, include: { collection: { select: { title: true } }, events: { orderBy: { createdAt: "asc" } } } }) : null;
  const outline = selected ? asOutline(selected.outline) : null;
  const evidence = selected ? asEvidence(selected.evidenceSnapshot) : [];
  const answer = selected ? asAnswer(selected.answer) : null;
  const evidenceMap = new Map(evidence.map((item) => [item.id, item]));

  return <main className="research-shell agent-shell">
    <header><Link href="/research">返回研究工作台</Link><p className="eyebrow">可信研究代理</p><h1>基于专题证据的问答与报告</h1><p>先冻结专题内证据并审阅大纲，确认后再生成带逐事实引用的报告。</p></header>
    <section><div className="section-heading"><h2>新建研究任务</h2><span>证据范围不会在确认后改变</span></div><AgentTaskCreator collections={collections} /></section>
    <div className="agent-workspace">
      <aside className="agent-history"><h2>任务历史</h2>{tasks.length ? <nav>{tasks.map((task) => <Link className={task.id === selected?.id ? "active" : ""} href={`/research/agent?task=${encodeURIComponent(task.id)}`} key={task.id}><strong>{task.question}</strong><span>{task.collection.title} · {modeLabels[task.mode]}</span><small>{statusLabels[task.status]} · {task.createdAt.toLocaleString("zh-CN", { hour12: false })}</small></Link>)}</nav> : <p className="empty-state">还没有研究任务。</p>}</aside>
      <section className="agent-task-detail">{selected ? <>
        <header><div><span className={`agent-status status-${selected.status.toLowerCase()}`}>{statusLabels[selected.status]}</span><h2>{selected.question}</h2><p>{selected.collection.title} · {modeLabels[selected.mode]} · 创建于 {selected.createdAt.toLocaleString("zh-CN", { hour12: false })}</p></div><AgentTaskActions taskId={selected.id} status={selected.status} retryable={selected.status === "RUNNING" && selected.updatedAt < new Date(Date.now() - 10 * 60 * 1000)} /></header>
        {selected.refusalReason && <div className="agent-refusal" role="status"><strong>无法基于当前专题回答</strong><p>{selected.refusalReason}</p></div>}
        {outline && <section className="agent-outline"><div className="section-heading"><h3>研究大纲</h3><span>{outline.evidenceCount} 条冻结证据</span></div><ol>{outline.steps.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.description}</p></li>)}</ol>{outline.subjects.length > 0 && <p><strong>研究对象：</strong>{outline.subjects.join("、")}</p>}</section>}
        <section className="agent-evidence"><div className="section-heading"><h3>证据快照</h3><span>创建任务时冻结</span></div>{evidence.length ? <ol>{evidence.map((item) => <li id={`evidence-${item.id}`} key={item.id}><div><code>{item.id}</code><span>{item.stance === "CONFLICT" ? "冲突" : item.stance === "SUPPORT" ? "支持" : "背景"}</span><time>{new Date(item.occurredAt).toLocaleDateString("zh-CN")}</time></div><strong>{item.eventTitle || item.documentTitle}</strong><p>{item.quote}</p><footer><Link href={item.href}>查看事件</Link><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceName} · {item.documentTitle}</a></footer></li>)}</ol> : <p className="empty-state">当前模式下没有可追溯证据。</p>}</section>
        {answer && <section className="agent-report"><div className="section-heading"><h3>{answer.title}</h3><span>{selected.modelVersion || "未知生成方式"}</span></div><p className="agent-summary">{answer.summary}</p><ol>{answer.facts.map((fact, index) => <li key={`${index}-${fact.claim}`}><div><strong>事实 {index + 1}</strong>{fact.kind === "INFERENCE" && <span className="inference-label">推测</span>}</div><p>{fact.claim}</p><footer>{fact.citations.map((citation) => { const source = evidenceMap.get(citation); return source ? <a href={`#evidence-${citation}`} key={citation}>{citation} · {source.sourceName}</a> : null; })}</footer></li>)}</ol>{answer.limitations.length > 0 && <aside><strong>局限与边界</strong><ul>{answer.limitations.map((item) => <li key={item}>{item}</li>)}</ul></aside>}</section>}
        {selected.error && <p className="form-message">{selected.error}</p>}
        <section className="agent-audit"><div className="section-heading"><h3>状态记录</h3><span>仅任务所有者可见</span></div><ol>{selected.events.map((event) => <li key={event.id}><time>{event.createdAt.toLocaleString("zh-CN", { hour12: false })}</time><strong>{statusLabels[event.status]}</strong><span>{event.detail}</span></li>)}</ol></section>
      </> : <p className="empty-state">选择任务查看大纲、证据和报告。</p>}</section>
    </div>
  </main>;
}
