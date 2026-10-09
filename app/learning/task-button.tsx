"use client";

import { useRef, useState, type FormEvent } from "react";
import type { PublicLearningExercise } from "@/lib/learning-policy";

type Result = { qualityScore: number; score: number; maxScore: number; feedback: { id: string; correct: boolean; explanation: string }[]; reviewCount: number };

export function TaskButton({ id, exercise, taskType, initialCompleted, initialQuality, blocked }: { id: string; exercise: PublicLearningExercise; taskType: string; initialCompleted: boolean; initialQuality: number | null; blocked: boolean }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const pending = useRef<{ body: string; key: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setMessage(""); setResult(null);
    const form = new FormData(event.currentTarget);
    const answers = Object.fromEntries(exercise.questions.map((question) => [question.id, form.getAll(`question-${question.id}`)]));
    const payload = JSON.stringify({ answers, output: form.get("output"), reflection: form.get("reflection"), selfRating: Number(form.get("selfRating")) });
    try {
      const storageKey = `learning-attempt:${id}`;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (pending.current?.body !== payload) {
        let key = crypto.randomUUID();
        try {
          const stored = JSON.parse(sessionStorage.getItem(storageKey) || "null");
          if (stored?.hash === hash && typeof stored.key === "string") key = stored.key;
          sessionStorage.setItem(storageKey, JSON.stringify({ hash, key }));
        } catch { /* Storage may be disabled; in-memory retry still works. */ }
        pending.current = { body: payload, key };
      }
      const response = await fetch(`/api/learning/tasks/${id}/attempts`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": pending.current.key }, body: payload });
      const body = await response.json();
      if (!response.ok) return setMessage(body.error || "提交失败，请稍后重试");
      pending.current = null;
      try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
      setResult(body); setMessage(`质量得分 ${body.qualityScore}，知识检查 ${body.score}/${body.maxScore}${body.reviewCount ? `，已加入 ${body.reviewCount} 个错题复习` : ""}`);
      void fetch("/api/behavior", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete_learning", value: body.qualityScore / 100 }) }).catch(() => {});
    } catch {
      setMessage("提交结果尚未确认，请重试");
    } finally {
      setLoading(false);
    }
  }

  return <form className="learning-exercise" onSubmit={submit}>
    <div><strong>{taskType === "CODE" ? "代码产出" : "实践产出"}</strong><p>{exercise.deliverable}</p><textarea aria-label="实践产出" name="output" rows={6} minLength={30} maxLength={6000} required /></div>
    <fieldset><legend>知识检查</legend>{exercise.questions.map((question) => <div className="learning-question" key={question.id}><strong>{question.prompt}</strong>{question.options.map((option) => <label key={option}><input type={question.kind === "multi" ? "checkbox" : "radio"} name={`question-${question.id}`} value={option} required={question.kind === "single"} /> <span>{option}</span></label>)}{result && <small className={result.feedback.find((item) => item.id === question.id)?.correct ? "answer-correct" : "answer-wrong"}>{result.feedback.find((item) => item.id === question.id)?.correct ? "回答正确" : `需要复习：${result.feedback.find((item) => item.id === question.id)?.explanation}`}</small>}</div>)}</fieldset>
    <label className="learning-field"><span>完成质量自评</span><select name="selfRating" defaultValue="3" required><option value="1">1 · 需要重学</option><option value="2">2 · 理解较少</option><option value="3">3 · 基本掌握</option><option value="4">4 · 能够应用</option><option value="5">5 · 能够解释</option></select></label>
    <label className="learning-field"><span>复盘</span><textarea name="reflection" rows={3} minLength={20} maxLength={2000} required placeholder="写下一个新认识和下一步验证方法" /></label>
    <div className="learning-submit"><button type="submit" disabled={loading || blocked}>{loading ? "评分中..." : blocked ? "先完成先修任务" : initialCompleted ? "再次提交" : "提交并评分"}</button>{initialCompleted && initialQuality !== null && !message && <small>上次质量得分 {initialQuality}</small>}{message && <small role="status">{message}</small>}</div>
  </form>;
}
