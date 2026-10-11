# 专题保存刷新补修（2026-10-11）

- 状态：修复已提交 `b41cdd2` 并推送 main；本机 Edge 桌面和移动视口的专题完整链路及 RSC 请求故障反例均通过。[GitHub 完整 CI 38120827548](https://github.com/CoderDongHuang/zhixian/actions/runs/38120827548) 全部通过，包含安全审计、Lint、类型、移动测试/导出、迁移、unit、构建、HTTP 和 72 项浏览器测试。
- 失败凭证：[run 38119680197](https://github.com/CoderDongHuang/zhixian/actions/runs/38119680197)。预算专项 10/10 通过、skip 0；完整 CI 的专题编辑测试失败，桌面重试仍失败。
- 下载 trace 确認：PATCH 携带新标题，服务端返回 200；随后的 RSC 刷新请求标为 ERR_ABORTED，界面保持旧标题。不能把它归因为 GitHub 额度或预算实现错误，也不能仅靠增加重试掩盖。
- 上游参考：[Next.js #99028](https://github.com/vercel/next.js/issues/99028) 报告同类“持久化成功、刷新不提交新界面”的生产构建问题。该报告主要针对 Next 16，本项目为 15.5.27；只作为症状参考，尚未证明内部根因完全一致。
- 创建和设置保存改用显式表单提交；提交中禁用相关操作，捕获网络异常并提示核对；成功后用文档重新加载读取持久化结果，绕过不可靠的 RSC 刷新。此操作会重置页面内尚未保存的输入，笔记应先保存。其他操作暂保留原刷新方式。
- 回归同时验证 PATCH、数据库读取、页面标题、重新打开表单；另在浏览器中阻断 RSC 请求，验证创建/保存/重新加载仍成立。
- 本机 Docker 4.82 启动失败参考 [官方反馈 #527](https://github.com/docker/desktop-feedback/issues/527)，通过备份临时 run/socket 父目录后恢复。原容器/卷保留，没有重置 WSL 或删除数据库；仅启动隔离测试容器。
