import * as Sentry from "@sentry/react-native";
import { request } from "./api";
import { initializeSentry } from "./sentry-config";
import { readSettings } from "./storage";

initializeSentry(Sentry.init);
export async function track(name: string, properties: Record<string, string | number | boolean> = {}) { if (!(await readSettings()).analytics) return; void request("/api/mobile/telemetry", { method: "POST", body: JSON.stringify({ name, properties, at: new Date().toISOString() }) }).catch(() => undefined); }
export function captureError(error: unknown) { Sentry.captureException(error); }
export { Sentry };
