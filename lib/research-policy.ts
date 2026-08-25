import { createHash } from "node:crypto";

export const RESEARCH_TITLE_MAX = 120;
export const RESEARCH_DESCRIPTION_MAX = 1000;
export const RESEARCH_NOTE_MAX = 4000;
export const CORRECTION_RESOLUTION_MAX = 2000;
export const RESEARCH_SHARE_TTL_DAYS = 30;

export const researchItemTypes = ["EVENT", "ENTITY", "DIGEST"] as const;
export type ResearchItemTypeValue = (typeof researchItemTypes)[number];

export function isResearchItemType(value: unknown): value is ResearchItemTypeValue {
  return typeof value === "string" && researchItemTypes.includes(value as ResearchItemTypeValue);
}

export function cleanRequiredText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function cleanOptionalText(value: unknown, maxLength: number) {
  const cleaned = cleanRequiredText(value, maxLength);
  return cleaned || null;
}

export function hashResearchShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function researchTargetHref(type: ResearchItemTypeValue, id: string) {
  if (type === "EVENT") return `/events/${encodeURIComponent(id)}`;
  if (type === "ENTITY") return `/entities/${encodeURIComponent(id)}`;
  return `/digests/${encodeURIComponent(id)}`;
}

export function parseTimelineWindow(value: unknown) {
  const days = Number(value);
  return days === 7 || days === 90 ? days : 30;
}
