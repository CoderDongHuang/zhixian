# V0.4 发布账户配置

## Expo 与 EAS

1. 在本机执行 `npx eas-cli@latest login`，完成 Expo 登录。
2. 进入 `mobile-app`，执行 `npx eas-cli@latest init`，选择现有项目或创建 `zhixian`。
3. 执行 `npx eas-cli@latest project:info`，记录 Project ID。
4. 在 Expo Account Settings 创建 Access Token。
5. 在 GitHub 仓库 `Settings > Secrets and variables > Actions` 新增 `EXPO_TOKEN` 和 `EXPO_PUBLIC_EAS_PROJECT_ID`。

## Sentry

1. 在 Sentry 创建 React Native 项目，记录组织 slug、项目 slug 和 DSN。
2. 创建仅具有 release/source map 权限的 Organization Auth Token。
3. 在 GitHub Actions Secrets 新增 `EXPO_PUBLIC_SENTRY_DSN`、`SENTRY_AUTH_TOKEN`、`SENTRY_ORG` 和 `SENTRY_PROJECT`。
4. 在 Sentry 设置 Release Health 低于 99.5%、冷启动 P75 高于 2.5 秒、同步 P75 高于 3 秒及 24 小时错误数超过 20 的告警。

## Apple

1. Apple Developer 创建 App ID `asia.zhixian.app`，启用 Push Notifications 和 Associated Domains。
2. App Store Connect 创建同 Bundle ID 的应用并记录 Apple ID。
3. 在本机执行 `npx eas-cli@latest credentials --platform ios`，配置 Distribution Certificate、Provisioning Profile 和 Push Key。
4. 在 App Store Connect 配置内测人员、隐私问卷、出口合规和隐私政策 URL `https://zhixian.asia/privacy`。

## Google Play

1. Play Console 创建包名为 `asia.zhixian.app` 的应用。
2. 创建 Google Cloud 服务账号，在 Play Console 授予发布到测试轨道的权限。
3. 首个 AAB 必须在 Play Console 手动上传；之后 EAS Submit 才能自动提交。
4. 在本机执行 `npx eas-cli@latest credentials --platform android`，确认 Android keystore 和 Play 服务账号。

## 执行顺序

1. 运行 `npm run release:check`，直到所有发布 Secret 通过。
2. GitHub Actions 运行 `Mobile release build`，分别生成 Android preview、Android production 和 iOS production。
3. 安装 preview 包并完成 `docs/mobile/device-matrix.md`。
4. 在 preview OTA channel 观察 48 小时，记录崩溃率、启动耗时、同步成功率和推送回执。
5. 运行 `Mobile store submission`，分别提交 Android 和 iOS。
6. 商店审核通过后再创建正式 `v0.4.0` 标签。
