"use client";
import { useState } from "react";

export function ExportTools({ digestId }: { digestId: string }) {
  const [template, setTemplate] = useState("executive");
  const [format, setFormat] = useState("html");
  function download() { window.location.href = `/api/reports/${digestId}/export?template=${template}&format=${format}`; }
  return <aside className="export-tools"><strong>导出报告</strong><label>模板<select value={template} onChange={(event) => setTemplate(event.target.value)}><option value="executive">决策摘要</option><option value="research">研究报告</option><option value="learning">学习笔记</option></select></label><label>格式<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="html">HTML / 打印 PDF</option><option value="markdown">Markdown</option><option value="json">JSON 数据</option></select></label><button type="button" onClick={download}>下载</button></aside>;
}
