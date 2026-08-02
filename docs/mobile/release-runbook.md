# V0.4 发布与回滚

## 首次配置

1. 在 Expo 账号中创建/绑定 `asia.zhixian.app` 项目。
2. 在 GitHub Actions Secrets 配置 `EXPO_TOKEN`、`EXPO_PUBLIC_EAS_PROJECT_ID`、`EXPO_PUBLIC_SENTRY_DSN`、`SENTRY_AUTH_TOKEN`、`SENTRY_ORG` 和 `SENTRY_PROJECT`。
3. 在 EAS Credentials 中确认 Android keystore、Apple Distribution Certificate 和 Provisioning Profile。
4. 在 Apple Developer 和 Google Play Console 完成应用标识、隐私声明及测试人员名单。

## 内测构建

运行 GitHub Actions 的 `Mobile release build`，选择 `preview`。Android 生成 APK；iOS 生成内部测试包。iOS 模拟器使用 `preview-simulator`。

## OTA 分批发布

先对 `preview` channel 发布并观察 48 小时，再对 `production` 发布。OTA 只能修改与当前 `runtimeVersion` 兼容的 JS/资源，新增原生模块必须重新构建安装包。

## 回滚

从 EAS Updates 获取上一个健康 update group ID，运行 `Mobile OTA update`，选择 `rollback` 并填写该 group。回滚后验证启动、登录、同步和推送深链。

## Sentry

- Release health：无崩溃会话比例告警阈值 99.5%。
- Performance：冷启动 P75 2.5 秒，同步 P75 3 秒。
- 告警：新问题、回归问题、24 小时错误数超过 20。
- Source map 上传由 EAS 构建中的 Sentry Expo 插件和 `SENTRY_AUTH_TOKEN` 完成。

## 数据库与推送任务

1. 合并包含 Prisma schema 变更的版本后，先手动运行 `Production database schema deployment`。
2. 确认 schema 部署成功后，再运行 `Digest delivery` 和 `Expo push receipts` 验证生产任务。
3. Expo receipt 每 30 分钟核验一次，标记失败交付并清理 `DeviceNotRegistered` 设备。

不要在 schema 部署前启用依赖新字段的定时任务，否则 Prisma 会以 `P2022` 失败并触发重复告警。
