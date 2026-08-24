"use client";
import { useState } from "react";

export function ExportTools({ digestId }: { digestId: string }) {
  const [template, setTemplate] = useState("executive");
  const [format, setFormat] = useState("html");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function download() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/reports/${digestId}/export`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ template, format }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "创建导出失败");
      window.location.assign(result.downloadUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建导出失败"); }
    finally { setBusy(false); }
  }
  return <aside className="export-tools"><strong>导出报告</strong><label>模板<select value={template} onChange={(event) => setTemplate(event.target.value)}><option value="executive">决策摘要</option><option value="research">研究报告</option><option value="learning">学习笔记</option></select></label><label>格式<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="html">HTML / 打印 PDF</option><option value="markdown">Markdown</option><option value="json">JSON 数据</option></select></label><button type="button" disabled={busy} onClick={download}>{busy ? "准备中…" : "下载"}</button>{message && <span className="form-message">{message}</span>}</aside>;
}
