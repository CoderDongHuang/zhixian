# 个人中心恢复与本机采集验收

2026-10-20：生产网页已包含账号设置代码，但生产迁移台账仍为 20 项，缺少 `AccountProfile`、`AccountVerification`。登录后 `/account` 查询缺表，出现 Next.js 流式服务端错误页；原健康接口只执行 `SELECT 1`，不能发现此故障。

修复前对生产 public schema 完成 custom-format 备份（1,851,032 字节，SHA-256 `8ef5723cc3bd661d29afdc2bec8191c156ce119840be7ae7ff27b2ac99724758`），核验已有 20 项迁移 checksum，确认唯一待执行迁移为 `20261019000100_account_settings`。备份保存在忽略提交的 `test-results/production-backup-20261019`，含私人数据，不应提交或分享。

在本机临时 PostgreSQL 17 恢复备份中的 User 表及数据、补齐其主键，预演新增账号表迁移并验证账号资料外键写入后回滚测试事务。本轮仅进行账号依赖范围恢复；完整历史 schema 恢复记录见 2026-10-12 的生产恢复文档。随后使用 `prisma migrate deploy` 完成生产迁移，`migrate status` 确认 up to date，21 项台账完整、新迁移 checksum 匹配，原用户数量不变。

已在用户原有登录浏览器刷新 `https://zhixian.asia/account`，确认个人中心、上传头像、邮箱重新绑定和密码设置表单正常显示。本轮未更改用户邮箱、密码或头像。健康接口增加两张账号表的存在检查，缺表时返回 503，避免再次将连接成功误报为账号功能健康。

按用户选择安装本机 Windows 任务 `ZhiXian-Free-Collection`，08:15 / 20:15 运行。修复 Windows `.env` BOM、Node 系统证书信任，以及跨境数据库访问下采集和任务租约默认事务超时。最终实跑 5 个来源均无失败：新增 61 条、更新 29 条材料，任务 `LastTaskResult=0`。未执行翻译、AI 分析、向量和通知。运行条件、日志和重试见 [本机采集说明](local-free-collection.md)。
