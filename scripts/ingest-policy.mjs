import { createHash } from "node:crypto";

export function normalizeDocumentText(value = "") {
  return String(value).normalize("NFKC").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function documentContentHash(title, content) {
  return createHash("sha256").update(`${normalizeDocumentText(title)}\n${normalizeDocumentText(content)}`).digest("hex");
}

export function githubMetrics(repo) {
  return {
    stars: Number(repo.stargazers_count) || 0,
    forks: Number(repo.forks_count) || 0,
    watchers: Number(repo.subscribers_count) || 0,
    openIssues: Number(repo.open_issues_count) || 0,
    githubUpdatedAt: repo.updated_at || null,
    pushedAt: repo.pushed_at || null,
  };
}
