# V0.4 真机验收矩阵

每个单元格必须记录设备型号、系统版本、构建 ID、测试人、日期和结果证据。没有真实设备证据不得标记完成。

## Android 阶段二设备准备（2026-10-21）

- 设备：用户的 Xiaomi 15 Pro（型号 `2410DPN6CC`），Android 16 / API 36，ABI `arm64-v8a`。USB 调试已授权，ADB 状态为 `device`；已安装 `asia.zhixian.app` 构建号 4。
- Google Play 服务已安装（版本 `26.04.38`）。首次检查为停用，用户在手机开启 Google 基础服务后，ADB 已核验主用户 `enabled=1`、`stopped=false`；这只是推送测试准备，不代表 FCM 已送达。
- 已安装：版本 `0.4.0` 构建号 3（基础包）→ 构建号 4（含 Firebase 配置），EAS 构建 ID 分别为 `a8fede2e-1809-4ac0-a319-73b95d5c9413`、`16e80300-f11a-48eb-b325-c834cb04065f`，均基于源码 `2e719c1`。构建号 4 包名、启动、覆盖升级和前台进程核验通过。
- 测试执行：维护者通过本机 ADB 完成安装、版本、启动与同签名覆盖升级；`POST_NOTIFICATIONS` 已授予。点“注册设备推送”时出现 `SERVICE_NOT_AVAILABLE`，尚未取得 FCM/Expo token，因此登录后服务端登记、后台送达、点击深链和回执仍待设备主人复测。

### 已完成的基础真机证据（2026-10-21）

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 构建号 3 首次安装 | 通过 | ADB `install -r` 返回成功；构建元数据见 `android-preview/baseline/android-preview.json` |
| 构建号 4 同签名覆盖升级 | 通过 | [覆盖升级截图](../../test-results/android-device-after-upgrade.png) |
| 构建号 4 冷启动与前台进程 | 通过 | `asia.zhixian.app/.MainActivity` resumed，无 `FATAL EXCEPTION` |
| Android 13+ 通知权限 | 通过 | [通知权限截图](../../test-results/android-push-permission-allowed.png)，ADB appops 为 `allow` |
| FCM token 获取 | 未通过 | [服务不可用截图](../../test-results/android-push-register-bottom.png)，显示 `SERVICE_NOT_AVAILABLE` |

| 场景 | Android 手机 | iPhone | iPad |
| --- | --- | --- | --- |
| 邮箱登录、刷新和退出 | 待真机 | 待真机 | 待真机 |
| 推送授权、分类和回执 | 待真机 | 待真机 | 待真机 |
| 推送点击文章/报告/任务 | 待真机 | 待真机 | 待真机 |
| 离线阅读与网络恢复重放 | 待真机 | 待真机 | 待真机 |
| 后台 15 分钟同步 | 待真机 | 待真机 | 待真机 |
| 低电量模式后台行为 | 待真机 | 待真机 | 待真机 |
| 100 MB 缓存与自动淘汰 | 待真机 | 待真机 | 待真机 |
| 生物识别锁与后台重锁 | 待真机 | 待真机 | 待真机 |
| 语音播报和中断恢复 | 待真机 | 待真机 | 待真机 |
| 深色、横屏和大字体 | 待真机 | 待真机 | 待真机 |
| OTA 更新与回滚 | 待真机 | 待真机 | 待真机 |

## 网络场景

- 飞行模式启动：显示已有缓存，不丢失待同步操作。
- 2G/高延迟：界面保持可操作，不重复提交。
- 请求中断：操作进入队列，自动重试达到 5 次上限后保留可见失败项，不静默丢弃；在设置页检查失败数量并手动“重试同步”。
- 重启与并发：断网排队后结束进程、重启、联网重放；让旧请求迟到，核验不覆盖新状态。自动化已有覆盖，仍须逐设备补真机证据，不能据此将矩阵标为完成。
- 多设备冲突：以服务端同步策略为准，最终状态一致。

## 发布阈值

- 无 P0/P1 缺陷。
- 冷启动 P75 小于 2.5 秒。
- 同步成功率不低于 99%。
- 无崩溃会话比例不低于 99.5%。
- 推送有效设备送达率不低于 95%。
- 48 小时 preview soak test 后才允许 production 构建。

## 2026-10-25 续验状态

Google Play 服务 `26.18.33` 已启用；用户确认 App 已登录并调整网络，浏览器可打开 Firebase，App 推送注册仍 `SERVICE_NOT_AVAILABLE`。推送送达与深链仍未通过。构建号 4 字体 115% 经结束进程再启动保留，覆盖升级后仍需核验。没有收藏/离线样本时不能声称对应数据保留。

iPhone/iPad：用户确认没有 Apple Developer 会员和苹果真机，所有真机单元格仍待验收；10/25 iOS JS/资源导出及模拟器原生云构建 `8336d730` 成功，Windows 未运行模拟器，详见 [苹果发行准备](ios-phase-three-readiness.md)。

### 构建号 6 补充（2026-10-25，维护者 / ADB）

设备仍为上述 Xiaomi 15 Pro / Android 16。EAS `950f3f05-ee1b-43b3-bfbf-7a1e22c6986b`，源码 `23d488f`，0.4.0 / 6，签名一致，覆盖安装成功。

- 异常网络冷启动、断网冷启动基础界面通过，不再持续加载；[断网截图](evidence/android-v6-offline-start.png)。
- 4→5→6 后 [字体 115% 保留](evidence/android-v6-settings-retained.png)，已恢复原 100%。仅证明该设置保留，收藏及离线正文尚无样本。
- 已拒绝通知后的注册错误提示通过，测试后恢复通知允许；[拒绝截图](evidence/android-v6-permission-denied.png)。注册中按钮禁用及失败后恢复通过。
- [FCM 注册仍失败](evidence/android-v6-push-unavailable.png)，业务网络恢复与推送闭环未通过；上方完整业务矩阵不据此勾选完成。详情见 [阶段二验收](android-phase-two-acceptance.md)。
