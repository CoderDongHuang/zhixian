# V0.4 发布与回滚

## 首次配置

1. 在 Expo 账号中创建/绑定 `asia.zhixian.app` 项目。
2. 在 GitHub Actions Secrets 配置 `EXPO_TOKEN`、`EXPO_PUBLIC_EAS_PROJECT_ID`、`EXPO_PUBLIC_SENTRY_DSN`、`SENTRY_AUTH_TOKEN`、`SENTRY_ORG` 和 `SENTRY_PROJECT`。
3. 在 EAS Credentials 中确认 Android keystore、Apple Distribution Certificate 和 Provisioning Profile。
4. 在 Apple Developer 和 Google Play Console 完成应用标识、隐私声明及测试人员名单。

## 内测构建

运行 GitHub Actions 的 `Mobile release build`，选择 `preview`。Android 生成 APK；iOS 生成内部测试包。iOS 模拟器使用 `preview-simulator`。

Android preview 的 Firebase 配置见 [接入指南](firebase-android-setup.md)：客户端文件使用 EAS preview 环境的 `GOOGLE_SERVICES_JSON` secret 文件变量，推送服务账号在 EAS Credentials 绑定 FCM v1，两者不能互换。preview 为缺少 Sentry 上传配置的内测环境设置 `SENTRY_DISABLE_AUTO_UPLOAD=true`；production 仍须补齐 Sentry 上传凭据。

### Android APK 收集与开放下载

1. 等待 EAS 状态为 `FINISHED`，保存 `eas build:view <build-id> --json` 的结果为 `eas-android-build.json`。排队、CLI 提交成功或 GitHub 调度成功均不代表已有 APK。
2. 使用 SDK 的 `aapt`、`apksigner` 收集真实元数据。Linux CI 已在 workflow 内设置这两个路径；Windows PowerShell 示例：

   ```powershell
   $env:AAPT = 'D:\java\sdk\build-tools\35.0.0\aapt.exe'
   $env:APKSIGNER = 'D:\java\sdk\build-tools\35.0.0\apksigner.bat'
   $env:JAVA_HOME = 'D:\java\javajdk\jdk-17'
   node scripts/android-preview-artifact.mjs eas-android-build.json android-preview
   ```

   路径按实际 SDK/JDK 修改。Windows 收集器直接用 Java 调用 SDK 的 `lib/apksigner.jar`，不经 shell 拼接文件名；签名验证失败会停止，不能跳过。
3. 核对输出的 APK、`android-preview.json` 和 `SHA256SUMS`。确认包名 `asia.zhixian.app`，比较新版与旧版签名证书摘要，核对版本号、最低 API 和支持架构。元数据中的 `deviceAcceptance` 初始为 `pending`，文件下载或签名通过不能自动改为真机通过。
4. 在已授权的 USB 设备先安装旧版，再以同签名较大 versionCode 的新版覆盖安装，保留应用数据。验证启动、登录、同步、断网恢复、通知授权/拒绝、后台推送与点击跳转，记录实际设备和构建 ID；登录和验证码由设备主人操作。
5. 真机验收通过后，将 APK、元数据和校验文件发布为同仓库有固定 tag 的 GitHub prerelease。核验公开下载与校验值后，才将 `app/install/android-release.json` 更新为 `status: testing`、`deviceAcceptance: passed`，并填写实际发行元数据。下载链接必须是该 tag 下的 `zhixian-android-preview.apk`。
6. EAS 临时下载地址和 30 天 CI artifact 仅用于构建交接，不作为长期公开下载入口。故障时将清单回退到 `status: pending`、`release: null`，页面保留安装指南；保留旧发行记录用于追溯。

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
