# Android 阶段二验收记录

日期：2026-10-21；续验：2026-10-25
项目：知线（`asia.zhixian.app`）  
设备：Xiaomi 15 Pro（型号 `2410DPN6CC`），Android 16 / API 36，ABI `arm64-v8a`，ADB serial `18fa448`

## 已完成

- Firebase 项目 `zhixian-574db` 已配置 Android 应用；EAS 项目 `wubug/zhixian` 已配置 `GOOGLE_SERVICES_JSON` 文件变量，FCM v1 服务账号已绑定。
- 基线 APK：EAS 构建 `a8fede2e-1809-4ac0-a319-73b95d5c9413`，版本 `0.4.0`、构建号 `3`，SHA-256 `0f25a3dbfa3fad75ef00f86c3cbd642c1a533491704a70b7022ed367cc4fbcc7`。
- Firebase APK：EAS 构建 `16e80300-f11a-48eb-b325-c834cb04065f`，版本 `0.4.0`、构建号 `4`，SHA-256 `5bf8ee521b5a184d785685c2f0e28780e6c4cf746996d97972e04427cfb0e771`。
- 两个 APK 包名均为 `asia.zhixian.app`，最低 API 24，支持 `arm64-v8a`、`armeabi-v7a`、`x86`、`x86_64`，签名证书 SHA-256 为 `34056464ffe103debf8a6d64fa155c9fc56ecd4de79387c1bf48fa6dbb161185`。
- 先安装构建号 3，再用构建号 4 完成同签名覆盖升级；构建号 4 冷启动、前台进程和无 AndroidRuntime 崩溃通过。
- Android 通知权限 `POST_NOTIFICATIONS` 已授予（ADB appops 为 `allow`）。

## 未完成

点击设置页“注册设备推送”后，手机显示：`Fetching the token failed: java.util.concurrent.ExecutionException: java.io.IOException: SERVICE_NOT_AVAILABLE`。因此本次没有拿到 Expo/FCM token，也没有完成服务端订阅登记、后台推送送达、通知点击深链或回执核验。

这不是 APK 安装失败。下一次验收需要设备主人使用自己的测试账号登录，并在 Google 基础服务启用、网络可用时重试；若仍失败，应记录设备上的 Google Play 服务/网络状态后再定位。不得读取生产 token 或批量发送推送。

## 证据

- [构建号 4 覆盖升级截图](../../test-results/android-device-after-upgrade.png)
- [通知权限已允许](../../test-results/android-push-permission-allowed.png)
- [通知设置页](../../test-results/android-notification-settings.png)
- [FCM 服务不可用提示](../../test-results/android-push-register-bottom.png)
- [构建号 3 元数据](../../android-preview/baseline/android-preview.json)
- [构建号 4 元数据](../../android-preview/firebase/android-preview.json)

## 发布状态

`app/install/android-release.json` 保持 `status: pending`。EAS 临时 artifact 地址不作为长期下载入口；只有推送闭环、固定 GitHub tag prerelease 和公开下载核验都完成后，才能改为 `testing` 并接入安装页。

## 2026-10-25 续验

- Google Play 服务 `26.18.33` 已启用，USB 正常；用户确认已登录知线并切换网络。浏览器可打开 Firebase 地址，App 再次注册仍失败为 `SERVICE_NOT_AVAILABLE`。ADB 探测先为 8 秒连接超时，网络调整后为 TLS 连接错误；没有成功 token、后台送达或点击证据。
- 推送注册增加 20 秒超时、注册中禁用、就近状态和登录失效提示；Android/iOS 使用各自的恢复说明。源码提交 `3e0bf10`。移动端 Jest 28/28、TypeScript、发布回归 90/90、项目 Lint 通过；iOS JS/资源导出成功不等于苹果真机通过。
- 同签名 3→4 安装已通过，但之前的证据不能证明收藏、离线数据或自定义设置被保留。构建号 4 中已将字体设为 115%，结束进程后重新进入仍为 115%；待构建号 5 覆盖安装后继续检查。
- 新 EAS 构建：`b9ceaa31-00a0-4df1-902c-ee3270548cfb`，版本 `0.4.0`、构建号 5，基于 `3e0bf106ba6f2a670ccaecc6f73078df5408d6b5`。构建完成与安装结果另行记录，不预先标通过。
- 登录/同步/断网恢复的业务闭环、通知拒绝路径、后台接收、点击与回执、固定 prerelease 及公开下载仍未完成。阶段二仍未完成，草稿 PR 保持未合并。
