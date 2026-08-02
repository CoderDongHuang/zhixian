# 知线正式 App

V0.4 React Native / Expo 客户端，包含邮箱认证、安全令牌、信息流、全文阅读、离线队列、后台同步、收藏与学习任务同步、推送深链、语音播报、生物识别应用锁、深色模式、匿名遥测和内部测试构建。

## 本地运行

```powershell
cd mobile-app
npm ci
$env:EXPO_PUBLIC_API_URL="https://zhixian.asia"
$env:EXPO_PUBLIC_EAS_PROJECT_ID="你的 EAS Project ID"
$env:EXPO_PUBLIC_SENTRY_DSN="你的 Sentry DSN" # 可选
npm start
```

推送、后台任务和生物识别必须使用 development build 或 EAS 真机包验证，Expo Go 不覆盖全部原生能力。

发布、OTA、回滚、Sentry 和真机验收步骤见 `docs/mobile/release-runbook.md` 与 `docs/mobile/device-matrix.md`。GitHub Actions 需要由仓库管理员配置 EAS/Sentry Secrets 后手动触发。

## 验证与构建

```powershell
npm run typecheck
npm test
npx expo-doctor
npx expo export --platform android
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile preview --platform ios
```

首次 EAS 构建需要执行 `npx eas-cli@latest login` 和 `npx eas-cli@latest init`，由 Expo 账号持有人确认项目、Android keystore 和 Apple 证书。Maestro 流程位于 `.maestro/`，需要安装测试包并提供隔离测试账号变量。
