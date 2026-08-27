"use client";

import { useState, type FormEvent } from "react";

export function ReviewCard({ review }: { review: { id: string; concept: string; prompt: string; options: string[]; taskTitle: string; repetition: number } }) {
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/learning/reviews/${review.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: form.getAll("answer") }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(body.error || "提交失败");
    setDone(true); setMessage(body.explanation);
  }
  return <article className="review-card"><span>{review.concept} · 已复习 {review.repetition} 次</span><h3>{review.prompt}</h3><small>来自：{review.taskTitle}</small>{!done && <form onSubmit={submit}>{review.options.map((option) => <label key={option}><input type="radio" name="answer" value={option} required /> <span>{option}</span></label>)}<button type="submit">提交复习</button></form>}{message && <p role="status">{message}</p>}</article>;
}
