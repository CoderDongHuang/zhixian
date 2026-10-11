# 运维与发布凭证

更新：2026-10-10。本文区分代码、本机测试和生产验收，不将配置变量存在视为配置有效。

## 数据健康监控

`GET /api/admin/operations` 仅管理员会话或 `Authorization: Bearer <MONITOR_TOKEN>` 可访问，响应禁止缓存。令牌至少 24 字符，应用部署环境和 GitHub `MONITOR_TOKEN` Secret 必须配置相同值；不要提交令牌到仓库。

配置 `CONTENT_PIPELINE_STATE=paused|active`。缺失或其他值为 unknown，监控失败而非默认健康。该变量描述运营状态，不是执行权限开关；生产工作流仍只允许手动触发，本次未恢复 cron。

指标包含来源/趋势来源最新成功抓取、当前可见版本最新分析时间、文档和分析积压、逐任务失败/过期/等待、24 小时执行失败率、通知失败、AI 用量与成本。首页显示最新内容时间及采集状态。最新内容时间目前是当前公开分析的 `analyzedAt`，不是来源发布日期，也不是独立记录的人工批准时刻。

默认来源/积压阈值 24 小时、发布内容阈值 48 小时，可用 `MONITOR_SOURCE_MAX_AGE_HOURS` / `MONITOR_PUBLICATION_MAX_AGE_HOURS` 修改。active 时陈旧数据为 WARNING；paused 不因停采集误报故障，但失败任务、通知失败和未知成本仍需处理。趋势来源不存在不声称覆盖完整；有 enabled 主体但无近期快照则提示陈旧。

运行 `npm run monitor:production`，需配置 `MONITOR_URL` 和 `MONITOR_TOKEN`。页面可用不再等于数据健康；缺令牌、指标不可用、未知运营状态、数据警告均退出 1。接口或脚本成功只是本次采样结果，不代表真实邮件到达、模型质量或备份有效。

## 逐任务恢复

`PipelineTask` 保存任务身份、材料/轮询版本、状态、租约和次数；`PipelineAttempt` 保留每次执行。采集、处理、分析、复审、实体抽取、向量、简报生成和趋势采集/预测均已接入。邮件/推送继续使用其专用投递记录，不通过生成任务重放重复发送。

同一身份串行领取；默认租约 120 秒，心跳续期；业务写入与租约核对在同一事务。超时执行不得覆盖新 worker。单一身份自动领取最多 3 次，失败/等待退避；下一次调用脚本时才重试，没有新增后台调度。新材料版本/新轮询窗口是新身份，不共享旧版本次数。

本机制不承诺跨模型提供商的 exactly-once 调用：进程在模型返回后、结果落库前死亡，重试可能再次产生模型费用。已提交结果但未完成任务记账也可能保留过期记录；材料/输出约束避免重复覆盖，操作员应确认结果后处理任务。SUCCEEDED / SUPERSEDED 不可重放。

```powershell
npm run tasks:replay -- <task-id>
npm run tasks:replay -- <task-id> --execute
```

第一条只读，检查身份/状态；第二条执行白名单脚本。仅 FAILED、WAITING、过期 RUNNING 可重放。材料已变更、资源已删除、配置被禁用或任务不匹配会明确失败，不把零输出算作成功。脚本仍须持有所需配置；生产重放会写业务数据、访问来源并可能产生模型费用，执行前先确认范围和授权。

## AI 成本

`AiCall` 记录提供商主机、模型、scope、任务 attempt、HTTP 状态、耗时以及提供商实际返回的 token 用量。不保存请求正文、提示词、密钥、完整 URL 或提供商错误正文。HTTP_SUCCEEDED 表示传输成功，不证明业务 JSON/研究证据校验成功；流水线业务失败由 attempt 标记，Web 规则降级不等于模型合格。

`AI_PRICING_JSON` 格式为 `{"provider-host/model":{"version":"price-date","inputPerMillion":2,"outputPerMillion":4}}`，金额单位 USD。只在用量和明确的版本化价格都可用时计算；缺失、非法或溢出记 null，不伪装成零费用。该数值是配置价格下的估算，不替代供应商账单；预算准入限制已实现，验收状态、配置与限制见 [预算与账单对账](ai-budget-and-reconciliation.md)。收费模型实测、实际账户额度与真实账单对账尚未验收。

## 发布凭证

每次正式灰度/发行创建独立凭证，至少填写以下实证，不要只勾选“Secret 已存在”：

| 项目 | 必填内容 |
| --- | --- |
| 环境 | preview/production、部署 ID/域名、核验时间、操作人；不含 Secret |
| 版本 | 完整提交 SHA、锁文件 SHA-256、部署产物 ID |
| 配置 | 数据库/认证/模型/邮件/推送/微信逐项实际验证结果；未用能力明确禁用 |
| 数据库 | migration 清单及 SQL 校验和、部署前后 schema drift 结果、执行记录 |
| 备份与恢复 | 真实备份 ID/时间、隔离恢复演练结果、RPO/RTO、恢复后数据核对 |
| CI | 对应提交的 GitHub run URL、conclusion、日志/测试报告；红色 run 不能算通过 |
| 灰度 | 登录、查看、保存、研究、分享、学习、同步及运维监控的实际结果 |
| 回滚 | 旧部署 ID、回滚步骤/耗时与演练日志；破坏性迁移不能仅回滚应用 |
| 结论 | 已发布/阻塞/仅本地通过，附剩余问题和负责人 |

本次凭证状态：仅本机隔离库 `127.0.0.1:55439/zhixian_fixes_test` 部署全部 18 项 migration，最后两项为 `20261009001000_operations_tasks` 和 `20261010000100_operations_foreign_keys`。后者补齐外键 ON UPDATE CASCADE，不改已部署 migration 的校验和。schema diff 仅报告业务模型之外的测试身份表 `E2eDatabaseIdentity`，无其他业务结构差异；该表必须保留以保护测试隔离。

本地验收：运维 PostgreSQL/HTTP mock 专项 13/13，关闭 E2E 绕过的认证 HTTP 1/1，数据库不可用时的运维 HTTP 1/1；默认 unit 链、Lint、应用/测试类型检查、移动类型与 Jest 11/11、生产构建 35 页以及完整桌面/移动视口浏览器回归 70/70 均通过。浏览器发布用例通过真实管理员批准接口验证当前摘要，已读通过显式动作写入，不再依赖 GET 副作用。移动 Jest 仍有既存 Sentry 定时器句柄提示。

最终实现凭证：提交 `16b30a4a8a4c4b166c40ab688cd3e720464d4764`，锁文件 SHA-256 `1AAE9A8A5D719A029E5DCB0590825B21B7BADC6A51C6F71D861A5F5D762D1CF5`；[GitHub quality gate 38048590366](https://github.com/CoderDongHuang/zhixian/actions/runs/38048590366) 于 2026-10-10 11:36 UTC 完成，conclusion 为 success。干净安装、安全门禁、Lint/类型、移动 Jest/Doctor/Android export、migration、unit、build、HTTP 和 E2E 均成功。本机同一实现最终复测发布专项 83/83、浏览器 70/70（2.8 分钟）。安全回补范围和 npm 原始风险说明见 [安全回补](security/security-backports-2026-10-10.md)。

未执行生产迁移、真实通知、收费模型调用或恢复生产调度。生产备份/恢复、当前配置有效性、原生真机及正式发行仍待验收。R01 代码与 CI 阻塞已解除，不等于发行完成。
