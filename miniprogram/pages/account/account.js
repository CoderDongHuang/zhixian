const app = getApp();
Page({
  data: { email: "", code: "", status: "", learningTitle: "", taskCount: 0 },
  onShow() { this.showSnapshot(); },
  setEmail(event) { this.setData({ email: event.detail.value.trim() }); },
  setCode(event) { this.setData({ code: event.detail.value.trim() }); },
  requestCode() {
    wx.request({ url: `${app.globalData.apiBase}/api/auth/request-code`, method: "POST", data: { email: this.data.email }, success: ({ statusCode }) => this.setData({ status: statusCode === 200 ? "验证码已发送" : "验证码发送失败" }) });
  },
  bindEmail() {
    app.request({ url: "/api/mini/auth/bind-email", method: "POST", data: { email: this.data.email, code: this.data.code } }).then(({ statusCode, data }) => {
      this.setData({ status: statusCode === 200 ? "绑定成功，数据已合并" : (data.error || "绑定失败") });
      if (data.accessTokenInvalidated) { wx.setStorageSync("syncCursor", "0"); app.globalData.accessToken = ""; app.globalData.accessExpiresAt = 0; app.authenticate().then(() => app.pullSync()).then(() => this.showSnapshot()); }
    });
  },
  unbindEmail() {
    app.request({ url: "/api/mini/auth/bind-email", method: "DELETE" }).then(({ statusCode, data }) => {
      this.setData({ status: statusCode === 200 ? "已解除绑定" : (data.error || "解除失败") });
      if (data.accessTokenInvalidated) { wx.setStorageSync("syncCursor", "0"); app.globalData.accessToken = ""; app.globalData.accessExpiresAt = 0; app.authenticate().then(() => app.pullSync()); }
    });
  },
  refreshSync() { app.pullSync().then(() => { this.showSnapshot(); this.setData({ status: "同步完成" }); }); },
  showSnapshot() {
    const snapshot = wx.getStorageSync("learningSnapshot") || {};
    this.setData({ learningTitle: snapshot.paths?.[0]?.title || "", taskCount: snapshot.tasks?.length || 0 });
  },
});
