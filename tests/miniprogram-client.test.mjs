import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

test("mini program exposes WeChat login status and retry controls", () => {
  const index = readFileSync(new URL("miniprogram/pages/index/index.wxml", root), "utf8");
  const account = readFileSync(new URL("miniprogram/pages/account/account.wxml", root), "utf8");
  assert.match(index, /\{\{loginStatus\}\}/);
  assert.match(index, /bindtap="retryLogin"/);
  assert.match(account, />微信登录</);
  assert.match(account, /\{\{loginStatus\}\}/);
});

test("mini program token storage retains account binding state", () => {
  let definition;
  const storage = new Map();
  const context = {
    App(value) { definition = value; },
    require() { throw new Error("no local config"); },
    wx: {
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
    },
  };
  vm.runInNewContext(readFileSync(new URL("miniprogram/app.js", root), "utf8"), context);
  definition.globalData = { ...definition.globalData };
  definition.storeTokens({ accessToken: "access", refreshToken: "refresh", expiresIn: 300, account: { linked: true, email: "reader@example.com" } }, () => {});
  assert.equal(definition.globalData.account.email, "reader@example.com");
  assert.equal(storage.get("miniAccount").linked, true);
  definition.resetSession();
  assert.equal(storage.has("refreshToken"), false);
  assert.equal(definition.globalData.account, null);
});

function pageInstance(path, app, storage = new Map()) {
  let page;
  vm.runInNewContext(readFileSync(new URL(path, root), "utf8"), {
    Page(value) { page = value; }, getApp: () => app,
    wx: { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key) },
  });
  page.data = { ...page.data };
  page.setData = update => Object.assign(page.data, update);
  return page;
}

for (const action of ["bindEmail", "unbindEmail"]) {
  test(`mini account: ${action} network error is visible and releases the button`, async () => {
    let fail = true;
    const app = { request: async () => { if (fail) throw new Error("断网"); return { statusCode: 200, data: { account: { linked: action === "bindEmail", email: "reader@example.com" } } }; }, setAccount() {} };
    const page = pageInstance("miniprogram/pages/account/account.js", app);
    page.data.email = "reader@example.com"; page.data.code = "123456";
    await page[action](); assert.match(page.data.status, /断网/); assert.equal(page.data.busy, false);
    fail = false; await page[action](); assert.match(page.data.status, /成功|已解除/); assert.equal(page.data.busy, false);
  });
}

test("mini account: changing identity clears old learning cache even if new sync fails", async () => {
  const storage = new Map([["learningSnapshot", { paths: [{ title: "旧账号私有路线" }], tasks: [{}] }], ["syncCursor", "9"]]);
  const app = { globalData: { accessToken: "old", accessExpiresAt: 999 }, request: async () => ({ statusCode: 200, data: { accessTokenInvalidated: true, account: { linked: false } } }), setAccount() {}, authenticate: async () => {}, pullSync: async () => { throw new Error("sync failed"); } };
  const page = pageInstance("miniprogram/pages/account/account.js", app, storage);
  await page.unbindEmail();
  assert.equal(storage.has("learningSnapshot"), false); assert.equal(storage.get("syncCursor"), "0");
  assert.equal(page.data.learningTitle, ""); assert.equal(page.data.taskCount, 0);
  assert.equal(page.data.linked, false); assert.match(page.data.status, /已解除绑定，同步未完成/); assert.equal(page.data.busy, false);
});

test("mini account: concurrent binding clicks issue only one mutation", async () => {
  let finish; let calls = 0;
  const page = pageInstance("miniprogram/pages/account/account.js", { request: () => { calls++; return new Promise(resolve => { finish = resolve; }); }, setAccount() {} });
  page.data.email = "reader@example.com"; page.data.code = "123456";
  const first = page.bindEmail(); await page.bindEmail(); assert.equal(calls, 1);
  finish({ statusCode: 200, data: {} }); await first; assert.equal(page.data.busy, false);
});

for (const failure of ["network", "http", "malformed"]) {
  test(`mini report: ${failure} failure recovers without reopening the page`, async () => {
    let fail = true;
    const page = pageInstance("miniprogram/pages/report/report.js", { request: async () => {
      if (!fail) return { statusCode: 200, data: { id: "report-1", title: "已恢复" } };
      if (failure === "network") throw new Error("断网");
      return { statusCode: failure === "http" ? 503 : 200, data: {} };
    } });
    await page.onLoad({ id: "report-1" }); assert.equal(page.data.loading, false); assert.ok(page.data.error);
    assert.equal(page.onShareAppMessage().path, "/pages/index/index");
    fail = false; await page.retryReport(); assert.equal(page.data.error, ""); assert.equal(page.data.report.title, "已恢复");
    assert.equal(page.onShareAppMessage().path, "/pages/report/report?id=report-1");
  });
}

test("mini report: unload fences late responses", async () => {
  let finish;
  const page = pageInstance("miniprogram/pages/report/report.js", { request: () => new Promise(resolve => { finish = resolve; }) });
  const running = page.onLoad({ id: "report-1" }); page.onUnload();
  finish({ statusCode: 200, data: { id: "report-1", title: "迟到报告" } }); await running;
  assert.equal(page.data.report, null);
});

test("mini sync rejects HTTP failures instead of reporting success or overwriting cache", async () => {
  let app;
  const storage = new Map([["syncCursor", "7"]]);
  vm.runInNewContext(readFileSync(new URL("miniprogram/app.js", root), "utf8"), { App: value => { app = value; }, require() { return {}; }, wx: { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) } });
  app.request = async () => ({ statusCode: 503, data: { cursor: "99", snapshot: { paths: [] } } });
  await assert.rejects(app.pullSync(), /同步失败/);
  assert.equal(storage.get("syncCursor"), "7"); assert.equal(storage.has("learningSnapshot"), false);
});
