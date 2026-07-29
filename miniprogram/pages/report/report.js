const app = getApp();
Page({
  data: { report: null, error: "", loading: true },
  onLoad({ id }) {
    if (!id) return this.setData({ error: "报告链接无效", loading: false });
    app.request({ url: `/api/mini/reports/${id}` }).then(({ statusCode, data }) => {
      if (statusCode !== 200) throw new Error(data?.error || "报告加载失败");
      this.setData({ report: data });
    }).catch((error) => this.setData({ error: error.message || "报告加载失败" })).finally(() => this.setData({ loading: false }));
  },
  onShareAppMessage() { return { title: this.data.report?.title || "知线报告试读", path: `/pages/report/report?id=${this.data.report?.id}` }; },
});
