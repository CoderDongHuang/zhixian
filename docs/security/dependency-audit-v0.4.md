# V0.4 依赖安全审计

审计时间：2026-08-23 23:04（Asia/Shanghai）

实现提交：`0d3e3c16ebe7723bc1af7670cc3f62811cc37c51`

`package-lock.json` SHA-256：`187358e52717391df4889de52a7ef9bea541d9a7e5676ea9e5e4f52574eede8e`

## 当前结果

`npm audit --omit=dev`：0 critical、29 high、4 moderate。29 个 high 是 npm 沿 Expo/Metro 依赖图传播后的包级计数，其高危根公告为 `image-size` 的 `1138808` 和 `1138809`；moderate 根公告为 `uuid` 的 `1119441`。npm 提供的自动修复路径是 Expo SDK 57 大版本升级。

本次已完成可保持当前架构兼容的修复：

- `fast-uri` 固定到 `3.1.5`。
- `nanoid` 固定到 `3.3.18`。
- `postcss` 固定到 `8.5.23`。
- Prisma Client/CLI 从受 `deepmerge-ts` 公告影响的 6.19.3 固定到安全的 `6.12.0`。
- `npm run audit:prod` 已进入 quality gate：critical 或新的 high 根公告会使 CI 失败；当前三个上游阻塞公告记录在 `dependency-audit-baseline.json`。

## 剩余风险

Expo SDK 54 的 Metro 0.83.3 使用 `image-size` 1.2.1，当前没有 SDK 54 兼容的上游修复。强制 override `image-size` 或只升级 Metro 会越过 Expo 的兼容矩阵，因此未在稳定性分支中采用。

剩余风险主要影响在 CI/开发机上处理恶意 ICNS、JXL 或 HEIF 资源的构建过程，不是 Next.js 线上请求处理路径。当前缓解措施是：仓库和构建资产均受信任、生产定时 Actions 继续暂停、新依赖公告由安全门禁阻断。

## 发布政策

- critical 不接受；新的 high 根公告不接受。
- Web/后端版本可在上述缓解措施和测试通过后发布。
- 原生商店正式版在 Expo SDK 57 升级、原生依赖对齐、Expo Doctor、Android/iOS 真机和 EAS 回归完成前保持阻塞。
- 每次发布前重新执行 `npm run audit:prod`，并更新实现提交、锁文件哈希和例外公告。
