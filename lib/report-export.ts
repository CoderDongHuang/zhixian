type ReportContent = { changes?: string[]; actions?: string[]; items?: { title: string; topic: string; whyImportant: string; confidence: number; source: string }[] };
type ReportDigest = { type: string; title: string; overview: string; content: unknown; createdAt: Date };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

function markdown(title: string, overview: string, content: ReportContent, template: string) {
  const label = template === "executive" ? "决策摘要" : template === "learning" ? "学习笔记" : "研究报告";
  const items = content.items || [];
  return `# ${title}\n\n> ${label}\n\n${overview}\n\n## 重要变化\n\n${(content.changes || []).map((value) => `- ${value}`).join("\n")}\n\n## 行动建议\n\n${(content.actions || []).map((value) => `- ${value}`).join("\n")}\n\n## 内容明细\n\n${items.map((value) => `### ${value.title}\n\n- 主题：${value.topic}\n- 来源：${value.source}\n- 可信度：${Math.round(value.confidence * 100)}%\n\n${value.whyImportant}`).join("\n\n")}`;
}

export function renderReportDownload(digest: ReportDigest, template: string, format: string) {
  const content = digest.content as ReportContent;
  const baseName = `zhixian-${digest.type.toLowerCase()}-${digest.createdAt.toISOString().slice(0, 10)}`;
  if (format === "json") return new Response(JSON.stringify({ title: digest.title, overview: digest.overview, template, content }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${baseName}.json"`, "Cache-Control": "private, no-store" } });
  const md = markdown(digest.title, digest.overview, content, template);
  if (format === "markdown") return new Response(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${baseName}.md"`, "Cache-Control": "private, no-store" } });
  const sections = md.split("\n").map((line) => line.startsWith("# ") ? `<h1>${escapeHtml(line.slice(2))}</h1>` : line.startsWith("## ") ? `<h2>${escapeHtml(line.slice(3))}</h2>` : line.startsWith("### ") ? `<h3>${escapeHtml(line.slice(4))}</h3>` : line.startsWith("- ") ? `<li>${escapeHtml(line.slice(2))}</li>` : line.startsWith("> ") ? `<p class="label">${escapeHtml(line.slice(2))}</p>` : line ? `<p>${escapeHtml(line)}</p>` : "").join("");
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escapeHtml(digest.title)}</title><style>body{font:16px/1.7 Arial,'Microsoft YaHei';color:#17211d;max-width:820px;margin:40px auto;padding:0 28px}h1{font-size:32px}h2{margin-top:32px;border-bottom:1px solid #ddd}.label{color:#176b4d;font-weight:700}@media print{body{margin:0}}</style><body>${sections}<script>window.addEventListener('load',()=>window.print())</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${baseName}.html"`, "Cache-Control": "private, no-store" } });
}
