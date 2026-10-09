import assert from "node:assert/strict";
import test from "node:test";
import { createWebPushController } from "../lib/web-push-client.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const never = <T>() => new Promise<T>(() => undefined);
type Intent = { endpoint: string; enabled: boolean; changedAt: number; subscription?: PushSubscriptionJSON };
function setup(options: { fetch?: typeof fetch; subscribe?: () => Promise<PushSubscription>; unsubscribe?: () => Promise<boolean>; readyHang?: boolean; current?: boolean } = {}) {
  let saved: Intent | null = null;
  let current = options.current ?? false;
  const methods: string[] = [];
  const subscription = { endpoint: "https://push.example.com/test", toJSON: () => ({ endpoint: "https://push.example.com/test", keys: { p256dh: "test", auth: "test" } }), unsubscribe: options.unsubscribe ?? (async () => { current = false; return true; }) } as unknown as PushSubscription;
  const controller = createWebPushController({
    timeoutMs: 20, read: () => saved, write: (value) => { saved = value; }, permission: async () => "granted",
    ready: async () => options.readyHang ? never() : ({ getSubscription: async () => current ? subscription : null, subscribe: options.subscribe ?? (async () => { current = true; return subscription; }) }),
    fetch: options.fetch ?? (async (_url, init) => { methods.push(init?.method ?? "GET"); return Response.json({ registered: true }); }),
  });
  return { controller, methods, subscription, saved: () => saved };
}

test("enable and disable persist monotonic intentions and reconcile server state", async () => {
  const env = setup();
  assert.equal(await env.controller.toggle(true), true);
  assert.equal(await env.controller.reconcile(), true);
  const first = env.saved()!.changedAt;
  assert.equal(await env.controller.toggle(false), false);
  assert.ok(env.saved()!.changedAt > first);
  assert.equal(env.saved()!.enabled, false);
  assert.equal(await env.controller.reconcile(), false);
});
test("ready timeout terminates", async () => { await assert.rejects(setup({ readyHang: true }).controller.toggle(true), /超时/); });
test("fetch ignoring AbortSignal still times out and rolls back", async () => {
  const env = setup({ fetch: async () => never() });
  await assert.rejects(env.controller.toggle(true), /超时/);
  assert.equal(env.saved()!.enabled, false);
});
test("late subscription is deleted and cannot overlap a new enable", async () => {
  const env = setup();
  const delayed = setup({ subscribe: async () => { await sleep(60); return env.subscription; }, unsubscribe: async () => { await sleep(10); return true; } });
  await assert.rejects(delayed.controller.toggle(true), /超时/);
  await assert.rejects(delayed.controller.toggle(true), /仍在处理/);
  await sleep(80);
  assert.equal(delayed.saved()!.enabled, false);
  assert.deepEqual(delayed.methods, ["DELETE"]);
});
test("server save failure rolls back browser subscription", async () => {
  const env = setup({ fetch: async () => new Response(null, { status: 500 }) });
  await assert.rejects(env.controller.toggle(true), /同步失败/);
  assert.equal(env.saved()!.enabled, false);
});
test("failed close persists tombstone and refresh retries instead of re-enabling", async () => {
  let failing = true;
  const methods: string[] = [];
  const env = setup({ current: true, fetch: async (_url, init) => { methods.push(init!.method!); return new Response(null, { status: failing ? 500 : 200 }); } });
  await assert.rejects(env.controller.toggle(false));
  assert.equal(env.saved()!.enabled, false);
  const time = env.saved()!.changedAt;
  failing = false;
  assert.equal(await env.controller.reconcile(), false);
  assert.ok(env.saved()!.changedAt > time);
  assert.deepEqual(methods, ["DELETE", "DELETE"]);
});
test("unsubscribe hangs without hanging the close operation", async () => {
  const env = setup({ current: true, unsubscribe: () => never() });
  await assert.rejects(env.controller.toggle(false), /超时/);
  assert.equal(env.saved()!.enabled, false);
  assert.deepEqual(env.methods, ["DELETE"]);
});
test("browser-only subscription is not reported as enabled", async () => {
  const env = setup({ current: true, fetch: async () => Response.json({ registered: false }) });
  assert.equal(await env.controller.reconcile(), false);
});
test("permission failure does not write subscription", async () => {
  const env = setup({ subscribe: async () => { throw new Error("permission denied"); } });
  await assert.rejects(env.controller.toggle(true), /permission denied/);
  await assert.rejects(env.controller.toggle(true), /permission denied/);
  assert.equal(env.saved(), null);
});
