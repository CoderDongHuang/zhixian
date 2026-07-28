const app = getApp();
Page({
  data: { items: [], loading: true },
  onLoad() { this.load(); },
  onPullDownRefresh() { this.load(); },
  load() {
    this.setData({ loading: true });
    app.request({ url: "/api/mini/feed" }).then(({ data }) => this.setData({ items: data.items || [] })).finally(() => { this.setData({ loading: false }); wx.stopPullDownRefresh(); });
  },
  open(event) {
    const { eventId, feedId } = event.currentTarget.dataset;
    app.sync([{ resource: "read", resourceId: feedId, value: { read: true }, changedAt: new Date().toISOString() }]);
    wx.navigateTo({ url: `/pages/report/report?id=${eventId}` });
  },
  toggleBookmark(event) {
    const feedId = event.currentTarget.dataset.feedId;
    const items = this.data.items.map((item) => item.id === feedId ? { ...item, bookmarked: !item.bookmarked } : item);
    const selected = items.find((item) => item.id === feedId);
    this.setData({ items });
    app.sync([{ resource: "bookmark", resourceId: feedId, value: { bookmarked: selected.bookmarked }, changedAt: new Date().toISOString() }]);
  },
});
