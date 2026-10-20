"use client";

import { useEffect, useId, useRef, useState } from "react";

const SIZE = 512;
type View = { zoom: number; x: number; y: number };

function constrain(view: View, image: HTMLImageElement): View {
  const zoom = Math.max(1, Math.min(4, view.zoom));
  const scale = Math.max(SIZE / image.naturalWidth, SIZE / image.naturalHeight) * zoom;
  const maxX = (image.naturalWidth * scale - SIZE) / 2;
  const maxY = (image.naturalHeight * scale - SIZE) / 2;
  return { zoom, x: Math.max(-maxX, Math.min(maxX, view.x)), y: Math.max(-maxY, Math.min(maxY, view.y)) };
}

export function AvatarCropper({ file, onCancel, onSave }: { file: File; onCancel: () => void; onSave: (file: File) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const helpId = useId();

  useEffect(() => {
    const modal = dialog.current!;
    modal.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const url = URL.createObjectURL(file);
    const picture = new window.Image();
    let active = true;
    picture.onload = () => { if (active) setImage(picture); };
    picture.onerror = () => { if (active) setError("图片无法读取，请更换图片。"); };
    picture.src = url;
    return () => { active = false; URL.revokeObjectURL(url); document.body.style.overflow = previousOverflow; modal.close(); };
  }, [file]);

  useEffect(() => {
    if (!image || !canvas.current) return;
    const context = canvas.current.getContext("2d")!;
    const scale = Math.max(SIZE / image.naturalWidth, SIZE / image.naturalHeight) * view.zoom;
    context.clearRect(0, 0, SIZE, SIZE);
    context.drawImage(image, (SIZE - image.naturalWidth * scale) / 2 + view.x, (SIZE - image.naturalHeight * scale) / 2 + view.y, image.naturalWidth * scale, image.naturalHeight * scale);
  }, [image, view]);

  useEffect(() => {
    const surface = canvas.current!;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      if (!image || busy) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 280 : 1);
      setView(current => constrain({ ...current, zoom: current.zoom * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.003) }, image!));
    }
    surface.addEventListener("wheel", wheel, { passive: false });
    return () => surface.removeEventListener("wheel", wheel);
  }, [image, busy]);

  async function save() {
    if (!image || busy) return;
    setBusy(true); setError("");
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(value => value ? resolve(value) : reject(new Error("裁剪失败，请重试。")), "image/webp", 0.9));
      if (blob.size > 2 * 1024 * 1024) throw new Error("裁剪后的图片不能超过 2 MB，请缩小后重试。");
      await onSave(new File([blob], "avatar.webp", { type: blob.type }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "头像保存失败，请重试。"); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="avatar-crop-dialog" aria-labelledby={titleId} aria-describedby={helpId} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={titleId}>裁剪头像</h2>
    <p id={helpId} className="setting-help">拖动图片调整位置，滚动鼠标滚轮缩放；也可使用下方滑块。</p>
    <div className="avatar-crop-viewport">
      <canvas ref={canvas} width={SIZE} height={SIZE} tabIndex={0} aria-label="头像裁剪区域，可拖动图片，使用滚轮缩放或方向键移动" onKeyDown={event => {
        if (!image || busy) return;
        const direction = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
        if (direction) { event.preventDefault(); setView(current => constrain({ ...current, x: current.x + direction[0], y: current.y + direction[1] }, image)); }
      }} onPointerDown={event => {
        if (!image || busy || !event.isPrimary || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }} onPointerMove={event => {
        const previous = drag.current;
        if (!previous || previous.id !== event.pointerId || !image || busy) return;
        const ratio = SIZE / event.currentTarget.getBoundingClientRect().width;
        const x = (event.clientX - previous.x) * ratio, y = (event.clientY - previous.y) * ratio;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        setView(current => constrain({ ...current, x: current.x + x, y: current.y + y }, image));
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} />
      <div className="avatar-crop-mask" aria-hidden="true" />
    </div>
    {!image && !error && <p role="status">正在读取图片…</p>}
    <label className="avatar-crop-zoom">缩放<input aria-label="头像缩放" type="range" min="1" max="4" step="0.01" value={view.zoom} disabled={!image || busy} onChange={event => { if (image) setView(current => constrain({ ...current, zoom: Number(event.target.value) }, image)); }} /><output>{Math.round(view.zoom * 100)}%</output></label>
    {error && <p role="alert" className="setting-message">{error}</p>}
    <div className="avatar-crop-actions"><button type="button" className="secondary" autoFocus disabled={busy} onClick={onCancel}>取消</button><button type="button" className="secondary" disabled={!image || busy} onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>重置</button><button type="button" disabled={!image || busy} onClick={() => void save()}>{busy ? "保存中…" : "确认并保存"}</button></div>
  </dialog>;
}
