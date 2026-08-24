# 生产数据库迁移 Runbook

更新日期：2026-08-23

生产环境只允许执行 `prisma migrate deploy`，禁止使用 `prisma db push`。首次接入迁移链时，现有生产库已经包含基线表结构，因此必须先登记基线，再部署 P1 增量迁移。

## 首次接入

1. 暂停写入任务，确认 Content pipeline、Digest delivery 等生产调度仍处于停用状态。
2. 创建可验证的数据库快照，并记录恢复点、数据库实例和当前应用提交。
3. 使用只读账号比较生产 schema 与提交 `151150b` 的 `prisma/schema.prisma`；有 drift 时停止迁移并先形成显式修复 SQL。
4. 在生产部署环境执行 `npx prisma migrate resolve --applied 20260823000000_baseline`。该命令只登记已有基线，不执行建表 SQL。
5. 执行 `npm run db:migrate:deploy`，依次应用 `20260823010000_p1_security_reliability` 和 `20260824000000_p2_hardening`。
6. 执行 `npx prisma migrate status`，确认没有 failed 或 pending migration，再部署依赖新字段的应用版本。
7. 验证 `/api/health`、OTP 请求/验证、内容采集 dry run 和 `PipelineRun` 写入，然后再按 README 的顺序逐个恢复自动化。

## 常规发布

1. 在隔离的 pgvector PostgreSQL 上从空库执行全部迁移和测试。
2. 生产迁移前创建快照并记录应用版本。
3. 先运行 `npm run db:migrate:deploy`，再发布向后兼容的应用代码。
4. 发布后执行 `npx prisma migrate status` 和健康检查。

## 失败与回滚

- 迁移尚未开始：停止发布，不做任何数据库变更。
- 迁移失败但事务已回滚：保留失败日志，修复迁移后用 `prisma migrate resolve --rolled-back <migration>` 标记，再重新部署。
- 迁移成功但应用失败：优先回滚应用版本；本次新增字段和表对旧版本向后兼容，可以暂时保留。
- 必须撤销数据库变更：停止全部写入，使用迁移前快照恢复到新实例，验证后切换连接。不要在仍有新版本写入时直接删除安全事件、快照或运行记录表。

`RawDocument.contentHash` 从唯一约束改为普通索引是有意变更：不同 URL 可以拥有相同正文。P1 迁移先回填 `RawDocument.updatedAt` 再设置非空，兼容存量数据。

P2 migration 新增的 `BehaviorEvent.dedupeKey` 与 `ReportExport.idempotencyKey` 均允许空值，对旧应用向后兼容；导出到 Digest 的外键使用 `ON DELETE SET NULL`。回滚应用时可保留这些字段和索引，避免破坏新版本已经产生的审计记录。
