# 数据保留与清理 Runbook

更新日期：2026-08-24

`npm run data:cleanup` 执行保留策略，`npm run data:cleanup -- --dry-run` 只统计候选记录。生产工作流 `Production data retention` 当前仅允许人工触发，并默认 dry run；Actions 预算、数据库备份和生产调度恢复前不得启用每日 schedule。

| 数据 | 保留期 |
| --- | --- |
| 过期 Email OTP | 7 天 |
| 过期 Session | 到期即清理 |
| 过期/撤销 MiniSession | 到期或撤销后最长 30 天 |
| AuthThrottle、SyncRequest | 7 天 |
| SyncChange | 90 天，但每个用户保留最新锚点 |
| BehaviorEvent | 180 天 |
| ReportExport、PushDelivery、PipelineRun | 90 天 |
| AlertDelivery | 180 天 |
| EmailDelivery、SecurityEvent、SourceSnapshot | 365 天 |
| TrendSnapshot | 730 天 |
| TrendForecast | 365 天 |

执行顺序：先创建数据库快照并记录表大小；运行 dry run 检查数量；在低流量窗口执行正式清理；复查 `/api/health`、同步全量重置、OTP 登录和报告导出。`SyncChange` 清理保留每个用户的最大 sequence，旧客户端 cursor 低于该锚点时服务端会自动返回全量 snapshot，避免静默漏同步。

隐私删除请求应使用用户级级联删除流程，不以保留期脚本代替。发生异常增长时先定位写入来源和索引命中，不直接缩短保留期掩盖问题。
