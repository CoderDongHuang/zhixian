let localConfig = {};
try { localConfig = require("./config"); } catch {}

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

App({
  globalData: { apiBase: localConfig.apiBase || "https://zhixian.asia", accessToken: "", accessExpiresAt: 0, refreshToken: "", deviceId: "" },
  onLaunch() {
    this.globalData.deviceId = wx.getStorageSync("deviceId") || randomId("wx");
    this.globalData.refreshToken = wx.getStorageSync("refreshToken") || "";
    wx.setStorageSync("deviceId", this.globalData.deviceId);
    this.authenticate().then(() => this.pullSync());
  },
  authenticate() {
    if (this.globalData.accessToken && this.globalData.accessExpiresAt > Date.now() + 30000) return Promise.resolve();
    if (this.authPromise) return this.authPromise;
    this.authPromise = new Promise((resolve, reject) => {
      const login = () => wx.login({ success: ({ code }) => wx.request({
        url: `${this.globalData.apiBase}/api/mini/auth/login`, method: "POST",
        data: { code, deviceId: this.globalData.deviceId },
        success: ({ statusCode, data }) => statusCode === 200 ? this.storeTokens(data, resolve) : reject(new Error("login failed")), fail: reject,
      }), fail: reject });
      if (!this.globalData.refreshToken) return login();
      wx.request({ url: `${this.globalData.apiBase}/api/mini/auth/refresh`, method: "POST", data: { refreshToken: this.globalData.refreshToken, deviceId: this.globalData.deviceId }, success: ({ statusCode, data }) => statusCode === 200 ? this.storeTokens(data, resolve) : login(), fail: login });
    }).finally(() => { this.authPromise = null; });
    return this.authPromise;
  },
  storeTokens(data, done) {
    this.globalData.accessToken = data.accessToken;
    this.globalData.accessExpiresAt = Date.now() + data.expiresIn * 1000;
    this.globalData.refreshToken = data.refreshToken;
    wx.setStorageSync("refreshToken", data.refreshToken);
    done(data);
  },
  request(options, retried) {
    return this.authenticate().then(() => new Promise((resolve, reject) => wx.request({
      ...options, url: `${this.globalData.apiBase}${options.url}`,
      header: { ...(options.header || {}), Authorization: `Bearer ${this.globalData.accessToken}` },
      success: (response) => {
        if (response.statusCode === 401 && !retried) {
          this.globalData.accessToken = "";
          this.globalData.accessExpiresAt = 0;
          this.authPromise = null;
          return this.request(options, true).then(resolve, reject);
        }
        resolve(response);
      }, fail: reject,
    })));
  },
  sync(mutations) {
    return this.request({ url: "/api/mini/sync", method: "POST", header: { "Idempotency-Key": randomId("sync") }, data: { deviceId: this.globalData.deviceId, mutations } });
  },
  pullSync() {
    const cursor = wx.getStorageSync("syncCursor") || "0";
    return this.request({ url: `/api/mini/sync?cursor=${cursor}` }).then(({ data }) => {
      if (data.cursor) wx.setStorageSync("syncCursor", data.cursor);
      if (data.snapshot) wx.setStorageSync("learningSnapshot", data.snapshot);
      return data;
    });
  },
});
