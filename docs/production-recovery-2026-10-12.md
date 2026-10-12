# 2026-10-12 生产首页恢复与迁移验收

## 原因与当前状态

线上首页 HTTP 200 返回 Next.js 服务器错误页，Digest `1748612648`；健康接口只证明能连接数据库。使用已有有效生产连接只读复现 `Event.isPublic` 缺列（SQLSTATE 42703 / Prisma P2022），且 `materialRevision`、`inputRevision` 尚不存在，没有 `_prisma_migrations`。代码已发布，数据库仍为早期 39 表基线。

生产修复已执行并完成线上复验。生产 cron 保持暂停，不调用收费模型或发送通知。

## 已完成的前置核验

- [x] 应用 public schema 备份，2026-10-12 09:01:11 UTC；8,451,711 字节，SHA-256 `4914dfb0d0e00afdd6560933c51d5e7d45d3b1e43315ff421527fe959a3fc2f5`。
- [x] 备份实际恢复至新建本机隔离库 `zhixian_restore_20261012`。备份不含 Supabase 托管 Auth/Storage schema，不宣称为整个平台备份。
- [x] 另建基线库，比较列、索引、枚举和约束。唯一差异：存量 `DeviceSubscription_endpoint_key` 为 UNIQUE 约束，而基线用同名 UNIQUE 索引；索引定义及唯一性等价，增量迁移不修改它，保留该约束。
- [x] 恢复库实际执行 Prisma 基线登记及剩余 19 项迁移，20 项台账完整，`migrate status` 为 up to date。
- [x] 核对迁移数据影响：4 用户、1,619 文档、635 事件、472 分析保留；472 历史分析改为 STALE；1,350 旧文档向量清除。历史分析无冻结输入凭证，不能继续当作当前有效结论；恢复内容运营后需重新分析、嵌入并核验发布。
- [x] 监测 HTTP 200 错误页漏报修复提交 `3982495`，[完整 CI 38226526449](https://github.com/CoderDongHuang/zhixian/actions/runs/38226526449) 成功。

备份、恢复日志、基线 schema diff 和迁移预演日志位于本机忽略目录 `test-results/production-backup-20261012/`，包含私有数据，不提交 GitHub。原库为 PostgreSQL 17.6，备份客户端为 17.11；本机恢复引擎为 pgvector/PostgreSQL 16，省略 PG17 独有的会话参数 `transaction_timeout`，兼容已有 public schema，未改变业务 DDL/DML。隔离恢复验证不等于 Supabase 实例切换或完整 RPO/RTO 演练。

## 可审核修复方案

1. 再次验证备份 hash、生产 schema 未漂移、迁移台账仍为空、恢复预演已通过。
2. 用已验证可连接的 Supabase session pooler 5432 作为本次 migration 连接；不使用 transaction pooler 6543，不输出凭据。当前本地 `.env.local` 连接报租户/用户不存在，不能直接用于迁移；有效连接来自既有 Prisma 配置。
3. 保留等价 endpoint 唯一约束，登记 `20260823000000_baseline` 为 applied，再用 `prisma migrate deploy` 部署其余 19 项，不执行 db push 或旧 SQL 升级脚本。
4. 验证所有 checksum、无 failed/pending migration，首页/趋势/实体/关系/简报等真实 HTTP 和浏览器界面。
5. 如失败，保留日志，按实际事务状态处理；需要撤销数据变更时使用本次备份恢复新实例后核验连接切换，不通过删除新表或直接回退应用猜测恢复。

## 生产结果

- [x] 2026-10-12 09:18:53–09:19:25 UTC 登记既有基线并部署其余 19 项迁移；`migrate status` 为 up to date。
- [x] 20 项台账均完成、无 rolled-back 项，逐项 checksum 与本地 SQL 匹配。
- [x] 旧缺列已存在，`latestPublication` 和信息流查询均成功；浏览器真实刷新首页，Digest 错误页消失。
- [x] 13 个 HTTP 检查通过：首页、健康、趋势、实体、关系、简报、产业、时间线、登录、搜索、隐私、研究与学习。后二者采用 Next 流式 meta refresh，普通 fetch 不会更改 final URL，浏览器已真实确认分别转到 `/login?next=/research` 与 `/login?next=/learning`，未发送验证码。
- [x] 浏览器点击趋势、更多→实体、研究、学习、返回发现；菜单路由切换后关闭。截图位于 `test-results/interface/production-home.jpg`。
- [x] 生产迁移后只读确认 4 用户、1,619 文档、635 事件、472 分析仍在；472 STALE、文档向量 0，与预演一致。
- [x] 代码提交 `3982495` 的完整 GitHub CI 与 Vercel 部署状态均为 success；公开站点实际渲染新版 Web。
- [ ] 本恢复记录提交后的最终 CI 与部署另行核验，不将上一 SHA 的成功替代最终 SHA。

内容可能暂时为空：迁移必须使无版本凭证的历史分析失效，生产采集仍暂停；不能为了填满首页伪造重新发布。

运行链接：[https://zhixian.asia](https://zhixian.asia)。本次应用 public schema 备份恢复已完成，不等于完整 Supabase 实例灾备、切换或 RPO/RTO 验收。平台配置对齐、真实模型/通知、历史材料重新分析、原生及微信真机仍待独立验收。

本机 `.env.local` 的连接覆盖仍无效，`DIRECT_URL` 尚未持久配齐；本次使用既有 Prisma 有效配置和实际验证成功的 session pooler，不宣称已经取得 Supabase 独立 direct 主机。线上首页的“采集状态未确认”仍反映部署未明确 `CONTENT_PIPELINE_STATE`，不能把暂停 GitHub cron 当作该环境变量已配置。

Vercel 诊断插件此前被自动审批服务 404 阻断，未执行，也未通过其他工具绕过该插件访问；本次使用既有数据库连接独立定位并修复根因。
