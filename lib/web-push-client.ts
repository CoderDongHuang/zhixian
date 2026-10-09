type Subscription = Pick<PushSubscription, "endpoint" | "unsubscribe" | "toJSON">;
type PushManagerLike = { getSubscription(): Promise<Subscription | null>; subscribe(): Promise<Subscription> };
type Intent = { endpoint: string; enabled: boolean; changedAt: number; subscription?: PushSubscriptionJSON };
type Dependencies = {
  ready(): Promise<PushManagerLike>;
  permission(): Promise<string>;
  fetch: typeof fetch;
  read(): Intent | null;
  write(intent: Intent): void;
  timeoutMs?: number;
};

export function createWebPushController(deps: Dependencies) {
  const timeoutMs = deps.timeoutMs ?? 15_000;
  let subscribing = false;
  let busy = false;
  let clock = 0;
  async function bounded<T>(promise: Promise<T>, late?: (value: T) => Promise<void>): Promise<T> {
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    promise.then((value) => { if (timedOut && late) void late(value).catch(() => undefined); }, () => undefined);
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error("推送操作超时，请重试同步")); }, timeoutMs); })]);
    } finally { clearTimeout(timer); }
  }
  async function request(method: string, intent: Intent) {
    const response = await bounded(deps.fetch("/api/push/subscribe", {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...intent.subscription, endpoint: intent.endpoint, changedAt: intent.changedAt }),
      signal: AbortSignal.timeout(timeoutMs),
    }));
    if (!response.ok) throw new Error("推送设置同步失败，请重试");
  }
  function intent(subscription: Subscription, enabled: boolean): Intent {
    clock = Math.max(Date.now(), clock + 1, (deps.read()?.changedAt ?? 0) + 1);
    const value = { endpoint: subscription.endpoint, enabled, changedAt: clock, ...(enabled ? { subscription: subscription.toJSON() } : {}) };
    deps.write(value);
    return value;
  }
  function tombstone(saved: Intent): Intent {
    clock = Math.max(Date.now(), clock + 1, saved.changedAt + 1);
    const value = { endpoint: saved.endpoint, enabled: false, changedAt: clock };
    deps.write(value);
    return value;
  }
  async function disable(subscription: Subscription) {
    const value = intent(subscription, false);
    // Persist server tombstone even if browser unsubscribe hangs or throws.
    const results = await Promise.allSettled([
      request("DELETE", value),
      bounded(subscription.unsubscribe()).then((ok) => { if (!ok) throw new Error("浏览器取消订阅失败，请重试"); }),
    ]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  async function reconcileState() {
    const manager = await bounded(deps.ready());
    const subscription = await bounded(manager.getSubscription());
    const saved = deps.read();
    if (saved && (!saved.enabled || subscription?.endpoint !== saved.endpoint)) {
      const value = tombstone(saved);
      await request("DELETE", value);
      if (subscription?.endpoint === saved.endpoint && !await bounded(subscription.unsubscribe())) throw new Error("浏览器取消订阅失败，请重试");
      return false;
    }
    if (!subscription) return false;
    if (saved?.enabled) await request("POST", saved);
    const response = await bounded(deps.fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" }));
    if (!response.ok) throw new Error("无法确认推送状态，请重试同步");
    return Boolean((await bounded(response.json())).registered);
  }
  async function reconcile() {
    if (busy || subscribing) throw new Error("推送设置正在同步");
    busy = true;
    try { return await reconcileState(); } finally { busy = false; }
  }
  async function toggle(enabled: boolean) {
    if (busy) throw new Error("推送设置正在同步");
    busy = true;
    try {
      const manager = await bounded(deps.ready());
      let subscription = await bounded(manager.getSubscription());
      if (!enabled) {
        if (subscription) await disable(subscription);
        else { const saved = deps.read(); if (saved) await request("DELETE", tombstone(saved)); }
        return false;
      }
      if (subscribing) throw new Error("浏览器订阅仍在处理，请稍后重试");
      if (await bounded(deps.permission()) !== "granted") throw new Error("通知权限未开启，请在浏览器设置中允许后重试");
      if (!subscription) {
        subscribing = true;
        let late = false;
        try {
          subscription = await bounded(manager.subscribe().catch((error) => { subscribing = false; throw error; }), async (value) => {
            try { await disable(value); } finally { subscribing = false; }
          });
        } catch (error) { late = true; throw error; }
        finally { if (!late) subscribing = false; }
      }
      const value = intent(subscription, true);
      try { await request("POST", value); }
      catch (error) { await disable(subscription).catch(() => undefined); throw error; }
      return true;
    } finally { busy = false; }
  }
  return { reconcile, toggle };
}
