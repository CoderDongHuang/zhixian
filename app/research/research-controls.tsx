"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

type CollectionOption = { id: string; title: string };

export function EntitySubscriptionButton({ entityId, initialSubscribed }: { entityId: string; initialSubscribed: boolean }) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [message, setMessage] = useState("");
  async function toggle() {
    const response = await fetch(`/api/research/subscriptions/${encodeURIComponent(entityId)}`, { method: subscribed ? "DELETE" : "POST" });
    if (response.ok) { setSubscribed(!subscribed); setMessage(subscribed ? "已取消关注" : "已关注，将在工作台汇总相关变化"); }
    else setMessage(response.status === 401 ? "请先登录" : "操作失败");
  }
  return <div className="research-inline-action"><button className={subscribed ? "secondary" : ""} type="button" onClick={toggle}>{subscribed ? "取消关注" : "关注实体"}</button>{message && <small>{message}</small>}</div>;
}

export function AddToCollection({ targetType, targetId }: { targetType: "EVENT" | "ENTITY" | "DIGEST"; targetId: string }) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!open || collections.length) return;
    fetch("/api/research/collections").then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json(); setCollections(data.collections); setCollectionId(data.collections[0]?.id || "");
    }).catch(() => setMessage("请先登录并创建研究专题"));
  }, [open, collections.length]);
  async function add(formData: FormData) {
    if (!collectionId) return setMessage("请先在研究工作台创建专题");
    const response = await fetch(`/api/research/collections/${encodeURIComponent(collectionId)}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType, targetId, note: formData.get("note") }) });
    setMessage(response.ok ? "已加入研究专题" : (await response.json().catch(() => null))?.error || "添加失败");
  }
  return <div className="collection-adder"><button className="secondary" type="button" onClick={() => setOpen(!open)}>加入研究专题</button>{open && <form action={add}><select aria-label="研究专题" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">选择专题</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><input name="note" maxLength={4000} placeholder="添加个人笔记（可选）" /><button type="submit">添加</button></form>}{message && <small>{message}</small>}</div>;
}

export function CreateCollection() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/research/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: formData.get("title"), description: formData.get("description") }) });
      // Read the persisted collection through a document navigation; a streamed RSC
      // refresh can leave the old tree displayed after a successful mutation.
      if (response.ok) { window.location.reload(); return; }
      setMessage((await response.json().catch(() => null))?.error || "创建失败");
    } catch { setMessage("网络异常，创建结果尚未确认，请刷新核对后再试"); }
    setPending(false);
  }
  return <form className="research-create" onSubmit={create}><label>专题名称<input name="title" required maxLength={120} disabled={pending} /></label><label>研究目标或说明<input name="description" maxLength={1000} disabled={pending} /></label><button type="submit" disabled={pending}>{pending ? "创建中…" : "新建专题"}</button>{message && <small role="status">{message}</small>}</form>;
}

export function CollectionSettings({ collectionId, initialTitle, initialDescription }: { collectionId: string; initialTitle: string; initialDescription: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/research/collections/${encodeURIComponent(collectionId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: formData.get("title"), description: formData.get("description") }) });
      if (response.ok) { window.location.reload(); return; }
      setMessage((await response.json().catch(() => null))?.error || "保存失败");
    } catch { setMessage("网络异常，保存结果尚未确认，请刷新核对后再试"); }
    setPending(false);
  }
  async function remove() {
    if (!window.confirm("确认删除这个研究专题及其笔记和分享？")) return;
    const response = await fetch(`/api/research/collections/${encodeURIComponent(collectionId)}`, { method: "DELETE" });
    if (response.ok) router.refresh(); else setMessage("删除失败");
  }
  return <div className="collection-settings"><button className="secondary" type="button" disabled={pending} onClick={() => setEditing(!editing)}>编辑专题</button>{editing && <form onSubmit={save}><label>专题名称<input name="title" required maxLength={120} defaultValue={initialTitle} disabled={pending} /></label><label>研究说明<textarea name="description" maxLength={1000} defaultValue={initialDescription} disabled={pending} /></label><div><button type="submit" disabled={pending}>{pending ? "保存中…" : "保存"}</button><button className="danger-button" type="button" disabled={pending} onClick={remove}>删除专题</button></div></form>}{message && <small role="status">{message}</small>}</div>;
}

export function CollectionItemControls({ itemId, initialNote }: { itemId: string; initialNote: string }) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote);
  const [message, setMessage] = useState("");
  async function save() {
    const response = await fetch(`/api/research/items/${encodeURIComponent(itemId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
    setMessage(response.ok ? "笔记已保存" : "保存失败"); if (response.ok) router.refresh();
  }
  async function remove() {
    const response = await fetch(`/api/research/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    if (response.ok) router.refresh(); else setMessage("移除失败");
  }
  return <div className="research-note"><textarea aria-label="个人笔记" value={note} maxLength={4000} onChange={(event) => setNote(event.target.value)} placeholder="记录判断、疑问和后续动作" /><div><button type="button" onClick={save}>保存笔记</button><button className="secondary" type="button" onClick={remove}>移除</button>{message && <small>{message}</small>}</div></div>;
}

export function ShareCollection({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  async function share() {
    const response = await fetch(`/api/research/collections/${encodeURIComponent(collectionId)}/share`, { method: "POST" });
    const data = await response.json().catch(() => null);
    if (!response.ok) return setMessage(data?.error || "创建分享失败");
    setUrl(data.url); setMessage(`已创建版本 ${data.version}，链接 30 天内有效`); router.refresh();
  }
  async function copy() { await navigator.clipboard.writeText(url); setMessage("分享链接已复制"); }
  return <div className="share-control"><button type="button" onClick={share}>创建只读分享</button>{url && <button className="secondary" type="button" onClick={copy}>复制链接</button>}{message && <small>{message}</small>}</div>;
}

export function RevokeShare({ shareId }: { shareId: string }) {
  const router = useRouter();
  async function revoke() { if ((await fetch(`/api/research/shares/${encodeURIComponent(shareId)}`, { method: "DELETE" })).ok) router.refresh(); }
  return <button className="text-button" type="button" onClick={revoke}>撤销</button>;
}

export function MarkNotificationRead({ id }: { id: string }) {
  const router = useRouter();
  async function mark() { if ((await fetch(`/api/research/notifications/${encodeURIComponent(id)}`, { method: "POST" })).ok) router.refresh(); }
  return <button className="secondary" type="button" onClick={mark}>标为已读</button>;
}
