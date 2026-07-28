"use client";
import { useState } from "react";

type EntityOption = { id: string; name: string; type: string };
export function EntityMergeForm({ entities }: { entities: EntityOption[] }) {
  const [sourceId, setSourceId] = useState(""); const [targetId, setTargetId] = useState(""); const [reason, setReason] = useState(""); const [message, setMessage] = useState("");
  async function merge() { if (!sourceId || !targetId || !window.confirm("确认合并？源实体将被删除，此操作只能通过数据库备份恢复。")) return; const response = await fetch("/api/admin/entities/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, targetId, reason }) }); const data = await response.json(); setMessage(response.ok ? `已合并到 ${data.entity.name}` : data.error); }
  return <section className="merge-form"><label>待合并实体<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">请选择</option>{entities.map((item) => <option key={item.id} value={item.id}>{item.type} · {item.name}</option>)}</select></label><label>保留实体<select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">请选择</option>{entities.map((item) => <option key={item.id} value={item.id}>{item.type} · {item.name}</option>)}</select></label><label>合并原因<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500}/></label><button onClick={merge} type="button">合并实体</button>{message && <p>{message}</p>}</section>;
}
