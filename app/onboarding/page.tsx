"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const fields = [
  { name: "identity", label: "你的身份", options: ["开发者", "学生", "转行学习者", "产品经理", "创业者"] },
  { name: "level", label: "当前水平", options: ["入门", "初级", "中级", "高级"] },
];
const multiFields = [
  { name: "skillDirections", label: "技术方向", options: ["AI 应用", "Java 后端", "Python", "前端", "暂未确定"] },
  { name: "learningGoals", label: "主要目标", options: ["了解行业", "提升技能", "找工作", "技术选型", "创业研究"] },
];

type Preference = {
  identity: string | null;
  level: string | null;
  skillDirections: string[];
  learningGoals: string[];
  topics: string[];
  itemsPerDigest: number;
  emailEnabled: boolean;
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  weeklyEnabled: boolean;
  weeklyDay: number;
  dailyLearningEnabled: boolean;
  dailyLearningTime: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [preference, setPreference] = useState<Preference | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/preferences").then(async (response) => response.ok ? (await response.json()).preference as Preference | null : null).then(setPreference).catch(() => setPreference(null));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(data.entries());
    const response = await fetch("/api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, skillDirections: data.getAll("skillDirections"), learningGoals: data.getAll("learningGoals"), topics: data.getAll("topics"), itemsPerDigest: Number(data.get("itemsPerDigest")), emailEnabled: data.has("emailEnabled"), morningEnabled: data.has("morningEnabled"), eveningEnabled: data.has("eveningEnabled"), weeklyEnabled: data.has("weeklyEnabled"), dailyLearningEnabled: data.has("dailyLearningEnabled") }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setMessage(result.error ?? "保存失败");
    router.push("/");
  }

  return <main className="onboarding"><header><p>个性化设置</p><h1>让信息流更适合你</h1><span>这些设置都可以稍后修改。</span></header>
    {preference === undefined ? <p className="empty-state">正在读取已保存设置...</p> : <form onSubmit={submit}>{fields.map((field) => <fieldset key={field.name}><legend>{field.label}</legend><div className="options">{field.options.map((option) => <label key={option}><input type="radio" name={field.name} value={option} defaultChecked={preference?.[field.name as "identity" | "level"] === option} />{option}</label>)}</div></fieldset>)}
      {multiFields.map((field) => <fieldset key={field.name}><legend>{field.label}（可多选）</legend><div className="options">{field.options.map((option) => <label key={option}><input type="checkbox" name={field.name} value={option} defaultChecked={preference?.[field.name as "skillDirections" | "learningGoals"].includes(option)} />{option}</label>)}</div></fieldset>)}
      <fieldset><legend>关注主题</legend><div className="options">{["AI 行业", "大模型", "GitHub 开源项目"].map((topic) => <label key={topic}><input type="checkbox" name="topics" value={topic} defaultChecked={preference?.topics.includes(topic)} />{topic}</label>)}</div></fieldset>
      <fieldset><legend>每次内容数量</legend><select name="itemsPerDigest" defaultValue={String(preference?.itemsPerDigest || 10)}><option value="5">5 条以内</option><option value="10">5-10 条</option><option value="20">10-20 条</option></select></fieldset>
      <fieldset><legend>邮件推送</legend><div className="time-settings"><label><input type="checkbox" name="emailEnabled" defaultChecked={preference?.emailEnabled ?? true} />接收邮件简报</label></div></fieldset>
      <fieldset><legend>简报时间</legend><div className="time-settings"><label><input type="checkbox" name="morningEnabled" defaultChecked={preference?.morningEnabled ?? true} />早报</label><input type="time" name="morningTime" defaultValue={preference?.morningTime || "08:00"} /><label><input type="checkbox" name="eveningEnabled" defaultChecked={preference?.eveningEnabled ?? true} />晚报</label><input type="time" name="eveningTime" defaultValue={preference?.eveningTime || "20:00"} /></div></fieldset>
      <fieldset><legend>每周汇总</legend><div className="time-settings"><label><input type="checkbox" name="weeklyEnabled" defaultChecked={preference?.weeklyEnabled ?? true} />接收周报</label><select name="weeklyDay" defaultValue={String(preference?.weeklyDay ?? 0)}><option value="0">周日</option><option value="1">周一</option><option value="5">周五</option><option value="6">周六</option></select></div></fieldset>
      <fieldset><legend>每日学习建议</legend><div className="time-settings"><label><input type="checkbox" name="dailyLearningEnabled" defaultChecked={preference?.dailyLearningEnabled ?? true} />生成每日学习任务</label><input type="time" name="dailyLearningTime" defaultValue={preference?.dailyLearningTime || "07:30"} /></div></fieldset>
      {message && <p className="form-message">{message}</p>}<div className="actions"><button type="button" className="secondary" onClick={() => router.push("/")}>暂时跳过</button><button type="submit" disabled={loading}>{loading ? "保存中..." : "保存并查看信息流"}</button></div>
    </form>}</main>;
}
