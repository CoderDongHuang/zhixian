const app = getApp();
Page({
  data: { email: "", code: "", status: "", loginStatus: "正在登录微信身份...", linked: false, linkedEmail: "", learningTitle: "", taskCount: 0, busy: false },
  onShow() { this.refreshAccount(); this.showSnapshot(); },
  refreshAccount() {
    return app.authenticate().then(() => {
      const account = app.globalData.account || {};
      this.setData({ loginStatus: "微信身份登录成功", linked: Boolean(account.linked), linkedEmail: account.email || "" });
    }).catch(() => this.setData({ loginStatus: "微信身份登录失败", status: "请检查网络，或稍后重新登录" }));
  },
  retryLogin() { if (this.data.busy) return; app.resetSession(); this.setData({ loginStatus: "正在登录微信身份...", status: "", linked: false, linkedEmail: "" }); this.showSnapshot(); return this.refreshAccount(); },
  setEmail(event) { this.setData({ email: event.detail.value.trim() }); },
  setCode(event) { this.setData({ code: event.detail.value.trim() }); },
  async requestCode() {
    if (this.data.busy) return;
    if (!this.data.email) return this.setData({ status: "请先输入已有账号邮箱" });
    this.setData({ busy: true, status: "" });
    try {
      const response = await new Promise((resolve, reject) => wx.request({ url: `${app.globalData.apiBase}/api/auth/request-code`, method: "POST", timeout: 15000, data: { email: this.data.email }, success: resolve, fail: reject }));
      this.setData({ status: response.statusCode === 200 ? "验证码已发送" : (response.data?.error || "验证码发送失败") });
    } catch { this.setData({ status: "验证码发送失败，请检查网络后重试" }); }
    finally { this.setData({ busy: false }); }
  },
  async bindEmail() {
    if (this.data.busy) return;
    if (!this.data.email || !/^\d{6}$/.test(this.data.code)) return this.setData({ status: "请填写邮箱和 6 位验证码" });
    this.setData({ busy: true, status: "" });
    try {
      const { statusCode, data } = await app.request({ url: "/api/mini/auth/bind-email", method: "POST", data: { email: this.data.email, code: this.data.code } });
      if (statusCode !== 200) throw new Error(data?.error || "绑定失败，请重新获取验证码");
      if (data.account) { app.setAccount(data.account); this.setData({ linked: Boolean(data.account.linked), linkedEmail: data.account.email || "", code: "" }); }
      this.setData({ status: "绑定成功，数据已合并" });
      if (data.accessTokenInvalidated) await this.reloadIdentity("绑定成功，同步未完成，请点击立即同步");
    } catch (error) { this.setData({ status: error.message || "绑定未完成，请检查网络后重试" }); }
    finally { this.setData({ busy: false }); }
  },
  async unbindEmail() {
    if (this.data.busy) return;
    this.setData({ busy: true, status: "" });
    try {
      const { statusCode, data } = await app.request({ url: "/api/mini/auth/bind-email", method: "DELETE" });
      if (statusCode !== 200) throw new Error(data?.error || "解除绑定失败");
      if (data.account) app.setAccount(data.account);
      this.setData({ linked: false, linkedEmail: "", status: "已解除绑定" });
      if (data.accessTokenInvalidated) await this.reloadIdentity("已解除绑定，同步未完成，请点击立即同步");
    } catch (error) { this.setData({ status: error.message || "解除绑定未完成，请检查网络后重试" }); }
    finally { this.setData({ busy: false }); }
  },
  async reloadIdentity(failureMessage) {
    wx.setStorageSync("syncCursor", "0"); wx.removeStorageSync("learningSnapshot");
    app.globalData.accessToken = ""; app.globalData.accessExpiresAt = 0;
    this.showSnapshot();
    try { await app.authenticate(); await app.pullSync(); this.showSnapshot(); }
    catch { this.setData({ status: failureMessage }); }
  },
  async refreshSync() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try { await app.pullSync(); this.showSnapshot(); this.setData({ status: "同步完成" }); }
    catch { this.setData({ status: "同步失败，请检查网络或重新登录后再试" }); }
    finally { this.setData({ busy: false }); }
  },
  showSnapshot() {
    const snapshot = wx.getStorageSync("learningSnapshot") || {};
    this.setData({ learningTitle: snapshot.paths?.[0]?.title || "", taskCount: snapshot.tasks?.length || 0 });
  },
});
