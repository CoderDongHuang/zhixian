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

### 启动恢复补修（2026-10-25）

- 电脑网络恢复后，构建号 5 已下载、校验并覆盖安装成功。大小 `74962891` 字节，SHA-256 `bede5bea4d9b135654355278b0e42222dca1f287e2c7eba51a2e9489dd0d240f`，签名与构建号 3/4 一致。包可安装不等于业务验收通过。
- 通知权限变更终止进程后，构建号 4/5 冷启动出现持续加载。定位为会话检查遇到网络异常时未结束 loading；该次通知拒绝测试未进入业务页面，不能标通过。已恢复主用户通知权限。
- 源码 `23d488f6375c2eb19f34716d979f36ec6194a1c1` 修复异常退出加载、可见重试、暂时断网保留有效本地会话及应用锁；服务端拒绝的会话仍返回登录。刷新遇到 401/403 才清除 token，暂时网络故障保留会话。
- 本机移动端 Jest **11 组 37/37**、移动端及 Web/测试 TypeScript、项目 Lint、发布回归 **90/90**、Next.js 生产构建、安装页浏览器专项 **36/36** 通过。iOS JS/资源导出通过。生产依赖安全检查通过（阻断项为空；已有 node-forge 回补的依赖传播告警仍保留，不代表零告警）。Next.js 更新至 `15.5.28`、undici 至 `6.29.1`。
- 上述源码的 [完整 GitHub CI 40155565269](https://github.com/CoderDongHuang/zhixian/actions/runs/40155565269) 已成功，包含隔离数据库、HTTP 及完整浏览器回归。此记录对应源码提交，后续文档提交的检查独立核验。
- 修复包：[EAS 950f3f05](https://expo.dev/accounts/wubug/projects/zhixian/builds/950f3f05-ee1b-43b3-bfbf-7a1e22c6986b)，`0.4.0` / 构建号 6，基于 `23d488f`，云构建 `FINISHED`。大小 `74963843` 字节，SHA-256 `5e11fb6dabc68e3bbc731b4276e86bc5aece1ef7a4dd1e9d2c756c536233b8b6`。aapt / apksigner 验证包名、最低 API 24、四种 ABI 与上述原签名一致；ADB 覆盖安装成功，设备版本号 6 已核验。

### 构建号 6 真机复验（2026-10-25，执行：维护者 / ADB）

| 项目 | 结果 | 证据及范围 |
| --- | --- | --- |
| 网络异常时冷启动 | 通过 | 结束进程再启动可进入发现页，显示缓存回退和重试入口，不再持续加载；不代表在线 API 成功 |
| 4→5→6 设置保留 | 通过 | [115% 字体仍选中](evidence/android-v6-settings-retained.png)；已恢复原值 100%，后续重启仍保留 |
| 推送注册中与失败恢复 | 通过 | UI XML 中注册按钮 `enabled=false`，结束后恢复 `enabled=true`；[服务不可用提示](evidence/android-v6-push-unavailable.png) |
| 已拒绝通知时注册 | 通过 | ADB 撤销权限、重启、点击注册后显示 [未获得通知权限](evidence/android-v6-permission-denied.png)；finally 恢复授权，主用户 granted=true 已复核。该测试不是首次系统授权弹窗验收 |
| 断网冷启动 | 基础界面通过 | Wi-Fi 关闭且移动数据原为关闭，结束进程重启能进入 [缓存界面](evidence/android-v6-offline-start.png)；finally 恢复 Wi-Fi，移动数据保持原值关闭 |
| 实际推送与业务恢复 | 未通过 / 待验收 | 本包注册仍显示服务不可用，未取得 token；无订阅、送达、点击或回执证据。缓存为空，没有可用文章样本验证收藏、离线正文或排队操作；不能把界面可用算作业务同步通过 |

**阶段二仍未完成，未合并、未公开发布测试包。** 下载清单继续 pending；需解决手机 App/Google 服务连接、完成业务及推送闭环后，再创建固定 prerelease 并验证公开下载。

本文件中 `test-results/` 与 `android-preview/` 为本机忽略目录，旧证据链接仅在维护者工作区可用，不是 GitHub 公开下载地址。
