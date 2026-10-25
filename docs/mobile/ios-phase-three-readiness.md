# iPhone / iPad 阶段三准备与验收

更新日期：2026-10-25。**准备进行中，阶段三未完成。** 用户确认目前没有 Apple Developer 会员，也没有 iPhone/iPad 真机。不能创建有效的发行证书、完成真机验收、发布 TestFlight 或 App Store；安装页继续提供 Safari 添加到主屏幕的方法。

## 当前已具备

- 复用 Expo SDK 54 移动客户端，Bundle ID 为 `asia.zhixian.app`，`supportsTablet: true`；有 Face ID 用途说明、通知插件和 `zhixian` URL scheme。
- EAS 项目 `wubug/zhixian` 已绑定。`preview-simulator` 是模拟器构建配置；`preview` 是内部设备分发，不能当作 TestFlight 包。TestFlight 使用商店分发的 `production` 配置。
- 推送注册失败时，iOS 显示网络重试说明；Android 的 Google 基础服务提示不会出现在 iOS。
- 2026-10-25 在源码 `23d488f` 上再次执行 iOS JS/资源导出，1552 个模块、23 个资源打包成功。命令：在 `mobile-app` 运行 `node ../node_modules/expo/bin/cli export --platform ios --output-dir ../test-results/ios-export-20261025-final --max-workers 2`。产物为本地诊断文件，**不是签名 IPA、模拟器运行或真机验收证据**。
- 无需付费会员的 iOS Simulator 云构建已成功：配置 `preview-simulator`，版本 `0.4.0` / 构建号 `1`，源码 `23d488f6375c2eb19f34716d979f36ec6194a1c1`，[EAS 构建 8336d730](https://expo.dev/accounts/wubug/projects/zhixian/builds/8336d730-04a9-45d2-8758-932e91c9ce02)，2026-10-25 10:51（北京时间）为 `FINISHED`。这证明原生模拟器包可编译；当前 Windows 未执行模拟器运行验收，不能替代 iPhone/iPad 安装、APNs、签名 IPA 或 TestFlight。

## 取得条件后按顺序执行

| 步骤 | 要完成的工作 | 当前结果 |
| --- | --- | --- |
| 1. 账户与设备 | 用户自行加入 Apple Developer Program，完成身份核验和付费；准备可安装目标系统的 iPhone 与 iPad | 未完成，缺会员及设备 |
| 2. 应用身份 | 在 Apple Developer 注册 Bundle ID，启用 Push Notifications / Associated Domains；在 App Store Connect 建立同一 ID 应用，记录 Team ID 和数字 Apple ID | 未完成 |
| 3. 签名与 APNs | 从 `mobile-app` 运行 EAS Credentials，配置 Distribution Certificate、Profile 和 APNs Key；凭据仅保存于受控账户 | 未完成 |
| 4. 原生构建 | 核验生产 Sentry/API/EAS 配置，运行发布检查，再运行 `eas build --platform ios --profile production`；等待 FINISHED 并保存构建 ID、版本和构建号 | 未完成 |
| 5. TestFlight | 使用 `eas submit --platform ios --profile production --id <实际构建ID>` 提交；等待处理完成，先内部测试，外部邀请按 Apple 要求审核 | 未完成 |
| 6. 双设备验收 | 在 iPhone、iPad 分别安装，执行下面的验收并保存实际截图与结果 | 未完成 |
| 7. 开放邀请 | 验证真实测试用户可通过邀请安装后才接入安装页；无公开邀请时仅展示实际可申请范围 | 未完成 |
| 8. App Store | 补齐商店信息、隐私和审核资料，审核通过且目标地区可访问后再开放商店入口 | 未完成 |

Windows 可提交 EAS 云构建，不能本地运行 Xcode 或 iOS Simulator。模拟器构建也不能安装在 iPhone/iPad 上；不能用 Android 截图替代苹果截图。

## 发行前需要补齐的产品与资料

- 审核账号：现有登录依赖邮箱验证码，需要提供审核可用的受控测试方式及操作说明，不能要求审核人员读取用户的私人邮箱。
- 账户删除：现有“退出并清除安全会话”只是退出。须核对应用是否支持账户创建、对应 Apple 账户删除要求，并完成可用的删除入口及服务端流程后再提交；不能把退出标为账户删除。
- 隐私问卷：逐项核对邮箱、账号 ID、收藏/学习记录、推送 token、反馈、Sentry 和分析设置，按实际收集、关联、用途和保留规则填写；不能直接宣称“不收集数据”。检查归档后的 Privacy Manifest 与所用 SDK 的声明。
- 深链：配置了 `applinks:zhixian.asia` 并不证明 Universal Links 可用。取得 Team ID 后需核验域名的 AASA 内容、HTTPS 响应及实际文章/报告跳转。
- 商店资料：见 [商店文案](store-listing.md)，还需实际支持联系入口、年龄分级、版权、地区、出口合规答复及 iPhone/iPad 的真实包截图。加密合规结论由实际依赖和用途确定，不预填豁免。

## 真机验收记录模板

每项写明设备型号、系统、构建 ID/构建号、日期、执行人、结果与脱敏证据；参考 [设备矩阵](device-matrix.md)。

- 邮箱登录、会话刷新、退出；审核测试账号流程。
- iPhone 竖横屏、iPad 竖横屏/分屏、大字体、深色模式和键盘遮挡。
- 通知允许/拒绝、APNs/Expo 登记、后台送达、回执、冷启动及前台点击文章/报告/学习任务。
- 离线阅读、断网排队、重启后恢复与联网同步；Face ID 及无生物识别设备回退。
- TestFlight 新装、覆盖升级后设置/离线数据保留，以及卸载；48 小时稳定性与回滚见 [发布流程](release-runbook.md)。

## 继续入口

- [Apple Developer Program](https://developer.apple.com/programs/)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [Expo iOS 生产构建](https://docs.expo.dev/build-reference/ios-builds/)
- [Expo iOS 提交](https://docs.expo.dev/submit/ios/)
- [Apple 审核指南](https://developer.apple.com/app-store/review/guidelines/)

阶段三完成条件仍是实际可安装的测试发行、iPhone/iPad 验收和真实发行入口。以上准备不替代阶段完成；待 Android 阶段二完成并合并后，再单独提交阶段三实现与验收结果。
