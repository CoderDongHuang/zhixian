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
