# 知线 Android 推送：首次创建 Firebase

更新日期：2026-10-21。状态：**项目与 Android 应用已创建，FCM v1 已启用；配置文件接入和推送验收未完成**。

已在 Edge 核验 Firebase 项目 `zhixian-574db`、项目编号 `504207312127`、Android 包名 `asia.zhixian.app` 和应用 ID `1:504207312127:android:3e7869fe96de03d32d38ca`。当前为 Spark 免费方案，不需要重复创建项目或应用。

USB 调试已连接 Xiaomi 15 Pro（Android 16），ADB 状态为 `device`；手机尚未安装知线。客户端配置下载尚未取得本机文件，服务账号私钥停留在生成确认页，未生成或上传。以下步骤保留作后续维护参考。

Firebase 用于 Android 的 FCM 推送。当前采用 Expo Push Service；无需为了此步骤接入 Analytics、Firestore 或更换现有登录系统。

## 1. 创建 Firebase 项目

1. 使用自己的 Google 账号打开 [Firebase 控制台](https://console.firebase.google.com/)，选择“创建项目 / Add project”。
2. 项目显示名称填写“知线”；项目 ID 使用控制台提供的可用 ID，记录下来。Google Analytics 是可选项，本轮可以关闭。
3. 创建后进入“项目概览”，点击 Android 图标添加应用。
4. **Android 软件包名必须填写 `asia.zhixian.app`**，应用昵称可填“知线 Android”。本轮仅配置 FCM，SHA-1 可先留空。
5. 下载 `google-services.json`。保存到自己的配置文件目录，提供文件绝对路径即可。
6. 控制台若显示手工修改 Gradle 的步骤，可完成应用注册；本项目由 Expo 配置生成 Android 工程，后续由维护者接入文件。

## 2. 创建 FCM v1 服务账号凭据

1. 点击项目概览旁的齿轮 →“项目设置”，确认 Android 应用包名正确。
2. 在“云消息传递 / Cloud Messaging”检查 **Firebase Cloud Messaging API (V1)** 已启用；如提示需要启用，进入对应 Google Cloud 页面启用该 API。
3. 打开“服务账号 / Service accounts”→“Firebase Admin SDK”→“生成新的私钥”，下载 JSON 文件。
4. 私钥保存到源码目录之外，例如自己的专用凭据目录。不要粘贴到聊天、提交 Git 或上传到网页静态目录。只提供文件路径。

这两个 JSON 的用途不同：`google-services.json` 是客户端配置；服务账号 JSON 是发送推送的私密凭据，不能放进 APK。创建项目/启用 FCM 本身通常不要求升级付费套餐；若控制台要求开通额外收费产品，先核对是否误选了其他功能。

## 3. 维护者接入步骤

- 核对两个文件属于同一 Firebase 项目，客户端配置中包名为 `asia.zhixian.app`，只记录核验结果，不输出密钥正文。
- 在 `mobile-app` 目录操作现有 EAS 项目 `wubug/zhixian`（ID `8694465e-acde-4a50-81a8-cc6483f044d3`）。将客户端配置添加为 preview 环境的文件变量 `GOOGLE_SERVICES_JSON`；`app.config.js` 已支持该文件路径。
- 用 `eas credentials --platform android` 的 FCM v1 / Google Service Account 相关入口上传服务账号凭据。不要用旧版 FCM server key，也不要将服务账号设为 `EXPO_PUBLIC_*`。
- 确认 preview profile 使用对应 EAS 环境后重新原生构建。新增客户端 Firebase 配置不能只通过 OTA 更新。
- 下载实际 APK，核验包名、版本号、签名、SHA-256，完成真机通知授权、后台接收、点击跳转及推送回执验证。拒绝权限不应破坏正常阅读。

官方参考：[Expo FCM v1 配置](https://docs.expo.dev/push-notifications/fcm-credentials/)、[Firebase Android 注册](https://firebase.google.com/docs/android/setup)。控制台菜单名称可能随语言与版本略有变化。

## 4. 连接安卓手机

手机开启开发者选项和 USB 调试，使用支持数据传输的 USB 线连接本电脑，解锁后允许本电脑调试。运行 `adb devices -l` 后应显示 `device`；`unauthorized` 表示仍需在手机确认，列表为空时先检查线缆、USB 模式与厂商驱动。

首次操作先检查手机型号、系统与现有应用。使用同一签名的新 APK 覆盖安装，避免先卸载或清除应用数据。登录可由设备主人操作；记录安装、登录、同步、断网恢复、推送与覆盖升级结果后，再开放公开下载入口。
