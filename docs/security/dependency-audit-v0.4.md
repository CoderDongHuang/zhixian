# V0.4 依赖安全审计

> 下文八月记录为历史结果，不能作为当前发行许可。2026-10-10 修复后结果如下；最新问题状态见 [项目复核](../项目复核与个人版建设建议-2026-10-09.md)。

## 2026-10-10 修复后复核

最新验收：braces `1240992` 与 node-forge `1240912` 已按 [安全回补记录](security-backports-2026-10-10.md) 修复，门禁验证整个安装源码树后单列 `remediated`，不抹掉 npm 原始风险计数。干净安装、发布专项 83/83、Lint 和联网门禁退出 0；实现提交 `16b30a4a8a4c4b166c40ab688cd3e720464d4764` 的 [GitHub 全链路 38048590366](https://github.com/CoderDongHuang/zhixian/actions/runs/38048590366) 已完成且 success。CI 原始 npm 报告 0 critical / 40 high / 13 moderate（53 个包级传播项），两项 `remediated`、`blocked: []`。本机最终完整浏览器回归 70/70（2.8 分钟），三类类型检查、移动 Jest、Doctor、Android export、18 项 migration、默认 unit、build 和两个非 E2E HTTP 均通过。

以下至“八月历史记录”前为本日回补前的阶段记录，双公告阻塞及旧测试计数不代表最新状态：

Web 安全补丁已落地；Metro 全家族由 0.83.3 同步升级至官方 0.83.8，使用其上游内置图片解析器，锁文件不再包含 image-size。没有强行替换为删除了文件路径 API 的 image-size 2.x，也没有升级 Expo 大版本。下文“没有 SDK 54 兼容补丁”的说法仅代表八月调查，不能沿用。

`npm ci`、默认 unit 链、Lint、Web/测试/移动端类型检查、移动 Jest 11/11、Expo Doctor 18/18、35 页生产构建、Android export（1550 模块、24 资源、4.29 MB）通过。发布专项 19/19，其中新增 17 项验证同步版本、10 个真实 PNG 及 6 类畸形图片无卡死。认证和运维真实本机生产 HTTP 各 1/1。

最终生产构建浏览器回归 70/70（2.7 分钟，桌面 Chromium/移动视口），隔离本机数据库，无真实通知和收费模型调用。

锁文件 SHA-256：`1AAE9A8A5D719A029E5DCB0590825B21B7BADC6A51C6F71D861A5F5D762D1CF5`。

`npm run audit:prod` 仍退出 1：0 critical、42 high、12 moderate，总计 54 个包级传播项，不是 54 个独立漏洞。新增阻塞根公告只剩：

- `1240992` / braces：深层嵌套模式导致栈耗尽；官方最新 3.0.3 仍受影响。
- `1240912` / node-forge：RSA PKCS#1 v1.5 验签接受额外嵌套 DigestAlgorithm；官方最新 1.4.0 仍受影响，[修复 PR 1152](https://github.com/digitalbazaar/forge/pull/1152) 本次核验仍未合并。

接受基线未扩大，已移除 image-size 的 `1138808` / `1138809` 两项过时 high 豁免，仅保留历史 uuid moderate `1119441`。未采用未审查的密码学分支或修改 CI 使其忽略新 high。R01 保留部分完成、发行阻塞；静态 Android 导出不能替代签名包、iOS/Android 真机和生产验收。

门禁错误放行补漏：旧脚本遇 npm 网络错误 JSON、缺字段或异常进程退出时可能退出 0，16 项初始回归中 9 项真实复现。修复后只接受完整、一致的 npm v2 审计结果；无结果/错误/异常退出/非法公告/不一致计数均退出 1，调用最长 120 秒。新增专项 17/17，默认 `test:release` 合计 36/36，Lint 通过；真实 npm 报告仍准确阻断上述两项公告，不将网络错误当作安全通过。

## 八月历史记录

审计时间：2026-08-23 23:04（Asia/Shanghai）

实现提交：`0d3e3c16ebe7723bc1af7670cc3f62811cc37c51`

`package-lock.json` SHA-256：`187358e52717391df4889de52a7ef9bea541d9a7e5676ea9e5e4f52574eede8e`

### 八月审计结果

`npm audit --omit=dev`：0 critical、29 high、4 moderate。29 个 high 是 npm 沿 Expo/Metro 依赖图传播后的包级计数，其高危根公告为 `image-size` 的 `1138808` 和 `1138809`；moderate 根公告为 `uuid` 的 `1119441`。npm 提供的自动修复路径是 Expo SDK 57 大版本升级。

本次已完成可保持当前架构兼容的修复：

- `fast-uri` 固定到 `3.1.5`。
- `nanoid` 固定到 `3.3.18`。
- `postcss` 固定到 `8.5.23`。
- Prisma Client/CLI 从受 `deepmerge-ts` 公告影响的 6.19.3 固定到安全的 `6.12.0`。
- `npm run audit:prod` 已进入 quality gate：critical 或新的 high 根公告会使 CI 失败；当前三个上游阻塞公告记录在 `dependency-audit-baseline.json`。

### 八月剩余风险

Expo SDK 54 的 Metro 0.83.3 使用 `image-size` 1.2.1，当前没有 SDK 54 兼容的上游修复。强制 override `image-size` 或只升级 Metro 会越过 Expo 的兼容矩阵，因此未在稳定性分支中采用。

剩余风险主要影响在 CI/开发机上处理恶意 ICNS、JXL 或 HEIF 资源的构建过程，不是 Next.js 线上请求处理路径。当前缓解措施是：仓库和构建资产均受信任、生产定时 Actions 继续暂停、新依赖公告由安全门禁阻断。

### 八月发布政策（历史，不作为当前发行许可）

- critical 不接受；新的 high 根公告不接受。
- Web/后端版本可在上述缓解措施和测试通过后发布。
- 原生商店正式版在 Expo SDK 57 升级、原生依赖对齐、Expo Doctor、Android/iOS 真机和 EAS 回归完成前保持阻塞。
- 每次发布前重新执行 `npm run audit:prod`，并更新实现提交、锁文件哈希和例外公告。
