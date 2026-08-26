"use client";

import { useState } from "react";

type CollectionItemOption = { targetType: "EVENT" | "ENTITY" | "DIGEST"; targetId: string; targetTitle: string };
type CollectionOption = { id: string; title: string; items: CollectionItemOption[] };
type AgentStatus = "AWAITING_CONFIRMATION" | "RUNNING" | "COMPLETED" | "REFUSED" | "FAILED" | "CANCELLED";

export function AgentTaskCreator({ collections }: { collections: CollectionOption[] }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [collectionId, setCollectionId] = useState(collections[0]?.id || "");
  const [mode, setMode] = useState("QUESTION");
  const [targetA, setTargetA] = useState(collections[0]?.items[0] ? `${collections[0].items[0].targetType}:${collections[0].items[0].targetId}` : "");
  const [targetB, setTargetB] = useState(collections[0]?.items[1] ? `${collections[0].items[1].targetType}:${collections[0].items[1].targetId}` : "");
  const selectedCollection = collections.find((collection) => collection.id === collectionId);
  function chooseCollection(id: string) {
    setCollectionId(id);
    const items = collections.find((collection) => collection.id === id)?.items || [];
    setTargetA(items[0] ? `${items[0].targetType}:${items[0].targetId}` : "");
    setTargetB(items[1] ? `${items[1].targetType}:${items[1].targetId}` : "");
  }
  async function create(formData: FormData) {
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/research/agent/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionId: formData.get("collectionId"), mode: formData.get("mode"), question: formData.get("question"), targetKeys: mode === "COMPARE" ? [formData.get("targetA"), formData.get("targetB")] : [] }) });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) return setMessage(data?.error || "创建任务失败");
    window.location.assign(`/research/agent?task=${encodeURIComponent(data.task.id)}`);
  }
  if (!collections.length) return <p className="empty-state">请先在研究工作台创建专题并加入事件、实体或简报。</p>;
  return <form className="agent-create" onSubmit={(event) => { event.preventDefault(); void create(new FormData(event.currentTarget)); }}>
    <label>研究专题<select name="collectionId" required value={collectionId} onChange={(event) => chooseCollection(event.target.value)}>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.title}</option>)}</select></label>
    <fieldset><legend>研究模式</legend><div className="agent-mode-options">
      <label><input type="radio" name="mode" value="QUESTION" checked={mode === "QUESTION"} onChange={(event) => setMode(event.target.value)} /><span>专题问答</span></label>
      <label><input type="radio" name="mode" value="COMPARE" checked={mode === "COMPARE"} onChange={(event) => setMode(event.target.value)} /><span>对象比较</span></label>
      <label><input type="radio" name="mode" value="CHANGES_30D" checked={mode === "CHANGES_30D"} onChange={(event) => setMode(event.target.value)} /><span>过去 30 天</span></label>
    </div></fieldset>
    {mode === "COMPARE" && <div className="agent-compare-targets"><label>比较对象一<select name="targetA" required value={targetA} onChange={(event) => setTargetA(event.target.value)}><option value="">选择对象</option>{selectedCollection?.items.map((item) => <option key={`${item.targetType}:${item.targetId}`} value={`${item.targetType}:${item.targetId}`}>{item.targetTitle}</option>)}</select></label><label>比较对象二<select name="targetB" required value={targetB} onChange={(event) => setTargetB(event.target.value)}><option value="">选择对象</option>{selectedCollection?.items.map((item) => <option key={`${item.targetType}:${item.targetId}`} value={`${item.targetType}:${item.targetId}`}>{item.targetTitle}</option>)}</select></label></div>}
    <label>研究问题<textarea name="question" required maxLength={1000} placeholder="输入需要核对的问题" /></label>
    <button type="submit" disabled={submitting}>{submitting ? "正在收集证据" : "生成大纲与证据"}</button>
    {message && <small role="alert">{message}</small>}
  </form>;
}

export function AgentTaskActions({ taskId, status, retryable = false }: { taskId: string; status: AgentStatus; retryable?: boolean }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function run(action: "confirm" | "cancel" | "retry") {
    setPending(true); setMessage("");
    const response = await fetch(`/api/research/agent/tasks/${encodeURIComponent(taskId)}/${action}`, { method: "POST" });
    const data = await response.json().catch(() => null);
    setPending(false);
    if (!response.ok) return setMessage(data?.error || "操作失败");
    window.location.reload();
  }
  return <div className="agent-actions">
    {status === "AWAITING_CONFIRMATION" && <><button type="button" disabled={pending} onClick={() => run("confirm")}>{pending ? "正在生成报告" : "确认并生成报告"}</button><button className="secondary" type="button" disabled={pending} onClick={() => run("cancel")}>取消任务</button></>}
    {(status === "FAILED" || retryable) && <button type="button" disabled={pending} onClick={() => run("retry")}>{pending ? "正在重试" : "使用原证据重试"}</button>}
    {message && <small role="alert">{message}</small>}
  </div>;
}
