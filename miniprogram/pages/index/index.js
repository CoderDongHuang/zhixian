const app = getApp();
Page({
  data: { items: [], loading: true, loginStatus: "正在登录微信身份...", error: "" },
  onLoad() { this.load(); },
  onShow() { this.updateLoginStatus(); },
  onPullDownRefresh() { this.load(); },
  load() {
    this.setData({ loading: true, error: "" });
    app.request({ url: "/api/mini/feed" }).then(({ statusCode, data }) => {
      if (statusCode !== 200) throw new Error(data?.error || "信息流加载失败");
      this.setData({ items: data.items || [] });
      this.updateLoginStatus();
    }).catch((error) => this.setData({ loginStatus: "微信登录失败", error: error.message || "请检查网络和服务器域名配置" })).finally(() => { this.setData({ loading: false }); wx.stopPullDownRefresh(); });
  },
  updateLoginStatus() {
    const account = app.globalData.account;
    if (app.globalData.accessToken) this.setData({ loginStatus: account?.linked ? `微信已登录 · ${account.email}` : "微信已登录 · 未绑定邮箱" });
  },
  retryLogin() { app.resetSession(); this.load(); },
  open(event) {
    const { eventId, feedId } = event.currentTarget.dataset;
    app.sync([{ resource: "read", resourceId: feedId, value: { read: true }, changedAt: new Date().toISOString() }]).catch(() => {});
    wx.navigateTo({ url: `/pages/report/report?id=${eventId}` });
  },
  toggleBookmark(event) {
    const feedId = event.currentTarget.dataset.feedId;
    const items = this.data.items.map((item) => item.id === feedId ? { ...item, bookmarked: !item.bookmarked } : item);
    const selected = items.find((item) => item.id === feedId);
    this.setData({ items });
    app.sync([{ resource: "bookmark", resourceId: feedId, value: { bookmarked: selected.bookmarked }, changedAt: new Date().toISOString() }]).catch(() => this.load());
  },
});
