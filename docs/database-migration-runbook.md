# 生产数据库迁移 Runbook

更新日期：2026-10-12

生产环境只允许执行 `prisma migrate deploy`，禁止使用 `prisma db push`。当前仓库包含 20 项迁移。是否需要登记基线必须以真实库 schema 和 `_prisma_migrations` 台账为准，不能假定生产库已经包含基线或机械使用旧提交。

## 首次接入

1. 暂停写入任务，确认 Content pipeline、Digest delivery 等生产调度仍处于停用状态。
2. 创建可验证的数据库快照，并记录恢复点、数据库实例和当前应用提交。
3. 用 `npm run configuration:check -- --database` 进行只读连接、迁移 checksum 与 vector 检查；在隔离实例按台账已应用的迁移重建预期 schema，再与生产比较。发现 drift 时先形成可审核修复方案。
4. 仅当台账为空且真实 schema 与 `20260823000000_baseline` SQL 一致时，才执行 `npx prisma migrate resolve --applied 20260823000000_baseline`。若存在仅实现形式不同的对象，须逐项证明语义等价、记录差异并在恢复库完整预演，不以“看起来相似”登记。有台账的库不重复登记；空库不登记基线，直接部署完整迁移链。
5. 根据当前 `prisma/migrations` 和生产台账确定全部待应用迁移，逐项审查 SQL 的数据影响，在恢复后的隔离实例完整预演，再执行 `npm run db:migrate:deploy`，不限于早期 P1/P2 两项。
6. 执行 `npx prisma migrate status`，确认没有 failed 或 pending migration，再部署依赖新字段的应用版本。
7. 验证 `/api/health`、OTP 请求/验证、内容采集 dry run 和 `PipelineRun` 写入。生产调度继续暂停，按用户确认的运营计划决定是否恢复。

## 常规发布

1. 在隔离的 pgvector PostgreSQL 上从空库执行全部迁移和测试。
2. 生产迁移前创建快照并记录应用版本。
3. 先运行 `npm run db:migrate:deploy`，再发布向后兼容的应用代码。
4. 发布后执行 `npx prisma migrate status`，确认 checksum，并检查首页等真实业务正文；HTTP 200 或数据库连接正常不能排除 Next 流式错误页。执行 `npm run monitor:production` 时也需有效监控令牌与明确运营状态。

2026-10-12 已完成当前生产基线登记和 19 项增量迁移，20 项台账完整。应用 public schema 备份、实际恢复、等价约束差异、数据影响和线上复验见 [生产恢复记录](production-recovery-2026-10-12.md)。

## 失败与回滚

- 迁移尚未开始：停止发布，不做任何数据库变更。
- 迁移失败但事务已回滚：保留失败日志，修复迁移后用 `prisma migrate resolve --rolled-back <migration>` 标记，再重新部署。
- 迁移成功但应用失败：先检查具体迁移与旧应用的兼容性，再决定回滚应用。材料新鲜度迁移会使历史分析失效并清理旧向量，不能认为所有迁移只回退应用就可恢复旧行为；需要按当前材料重新分析、发布和嵌入，或使用已验证快照恢复。
- 必须撤销数据库变更：停止全部写入，使用迁移前快照恢复到新实例，验证后切换连接。不要在仍有新版本写入时直接删除安全事件、快照或运行记录表。

`RawDocument.contentHash` 从唯一约束改为普通索引是有意变更：不同 URL 可以拥有相同正文。P1 迁移先回填 `RawDocument.updatedAt` 再设置非空，兼容存量数据。

P2 migration 新增的 `BehaviorEvent.dedupeKey` 与 `ReportExport.idempotencyKey` 均允许空值，对旧应用向后兼容；导出到 Digest 的外键使用 `ON DELETE SET NULL`。回滚应用时可保留这些字段和索引，避免破坏新版本已经产生的审计记录。
