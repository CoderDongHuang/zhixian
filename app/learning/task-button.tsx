"use client";
import { useState } from "react";

export function TaskButton({ id, initialCompleted }: { id: string; initialCompleted: boolean }) {
  const [completed, setCompleted] = useState(initialCompleted);
  async function toggle() {
    const response = await fetch(`/api/learning/tasks/${id}`, { method: "PATCH" });
    if (response.ok) { const result = await response.json(); setCompleted(result.completed); if (result.completed) fetch("/api/behavior", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete_learning" }) }); }
  }
  return <button type="button" className={completed ? "secondary" : ""} onClick={toggle}>{completed ? "已完成" : "标记完成"}</button>;
}
