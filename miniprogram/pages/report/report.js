const app = getApp();
Page({
  data: { report: null, error: "", loading: true },
  onLoad({ id }) { this.reportId = id; this.destroyed = false; return this.loadReport(); },
  onUnload() { this.destroyed = true; },
  async loadReport() {
    const attempt = (this.attempt || 0) + 1; this.attempt = attempt;
    this.setData({ report: null, error: "", loading: true });
    try {
      if (!this.reportId) throw new Error("报告链接无效");
      const { statusCode, data } = await app.request({ url: `/api/mini/reports/${encodeURIComponent(this.reportId)}` });
      if (statusCode !== 200) throw new Error(data?.error || "报告加载失败，请重试");
      if (!data?.id || !data?.title) throw new Error("报告内容暂时不可用");
      if (!this.destroyed && this.attempt === attempt) this.setData({ report: data });
    } catch (error) { if (!this.destroyed && this.attempt === attempt) this.setData({ error: error.message || "报告加载失败，请检查网络" }); }
    finally { if (!this.destroyed && this.attempt === attempt) this.setData({ loading: false }); }
  },
  retryReport() { return this.loadReport(); },
  onShareAppMessage() {
    return this.data.report ? { title: this.data.report.title, path: `/pages/report/report?id=${encodeURIComponent(this.data.report.id)}` } : { title: "知线 · AI 行业观察", path: "/pages/index/index" };
  },
});
