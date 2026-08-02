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

部署 Prisma schema 后定时执行 `npm run push:receipts`，建议每 10 分钟一次。该任务核验 Expo receipt，标记失败交付并清理 `DeviceNotRegistered` 设备。
