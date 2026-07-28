const app = getApp();
Page({
  data: { report: null },
  onLoad({ id }) { app.request({ url: `/api/mini/reports/${id}` }).then(({ data }) => this.setData({ report: data })); },
  onShareAppMessage() { return { title: this.data.report?.title || "知线报告试读", path: `/pages/report/report?id=${this.data.report?.id}` }; },
});
