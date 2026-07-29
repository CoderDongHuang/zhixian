const app = getApp();
Page({
  data: { email: "", code: "", status: "", loginStatus: "正在登录微信身份...", linked: false, linkedEmail: "", learningTitle: "", taskCount: 0 },
  onShow() { this.refreshAccount(); this.showSnapshot(); },
  refreshAccount() {
    app.authenticate().then(() => {
      const account = app.globalData.account || {};
      this.setData({ loginStatus: "微信身份登录成功", linked: Boolean(account.linked), linkedEmail: account.email || "" });
    }).catch(() => this.setData({ loginStatus: "微信身份登录失败", status: "请检查网络、AppID、AppSecret 和服务器合法域名" }));
  },
  retryLogin() { app.resetSession(); this.setData({ loginStatus: "正在登录微信身份...", status: "" }); this.refreshAccount(); },
  setEmail(event) { this.setData({ email: event.detail.value.trim() }); },
  setCode(event) { this.setData({ code: event.detail.value.trim() }); },
  requestCode() {
    if (!this.data.email) return this.setData({ status: "请先输入已有账号邮箱" });
    wx.request({ url: `${app.globalData.apiBase}/api/auth/request-code`, method: "POST", data: { email: this.data.email }, success: ({ statusCode, data }) => this.setData({ status: statusCode === 200 ? "验证码已发送" : (data?.error || "验证码发送失败") }), fail: () => this.setData({ status: "验证码发送失败，请检查网络" }) });
  },
  bindEmail() {
    app.request({ url: "/api/mini/auth/bind-email", method: "POST", data: { email: this.data.email, code: this.data.code } }).then(({ statusCode, data }) => {
      this.setData({ status: statusCode === 200 ? "绑定成功，数据已合并" : (data.error || "绑定失败") });
      if (statusCode === 200 && data.account) { app.setAccount(data.account); this.setData({ linked: true, linkedEmail: data.account.email || "" }); }
      if (data.accessTokenInvalidated) { wx.setStorageSync("syncCursor", "0"); app.globalData.accessToken = ""; app.globalData.accessExpiresAt = 0; app.authenticate().then(() => app.pullSync()).then(() => this.showSnapshot()); }
    });
  },
  unbindEmail() {
    app.request({ url: "/api/mini/auth/bind-email", method: "DELETE" }).then(({ statusCode, data }) => {
      this.setData({ status: statusCode === 200 ? "已解除绑定" : (data.error || "解除失败") });
      if (statusCode === 200 && data.account) { app.setAccount(data.account); this.setData({ linked: false, linkedEmail: "" }); }
      if (data.accessTokenInvalidated) { wx.setStorageSync("syncCursor", "0"); app.globalData.accessToken = ""; app.globalData.accessExpiresAt = 0; app.authenticate().then(() => app.pullSync()); }
    });
  },
  refreshSync() { app.pullSync().then(() => { this.showSnapshot(); this.setData({ status: "同步完成" }); }).catch(() => this.setData({ status: "同步失败，请重新登录后再试" })); },
  showSnapshot() {
    const snapshot = wx.getStorageSync("learningSnapshot") || {};
    this.setData({ learningTitle: snapshot.paths?.[0]?.title || "", taskCount: snapshot.tasks?.length || 0 });
  },
});
