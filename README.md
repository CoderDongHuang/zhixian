# 知线 Zhixian

AI 行业研究平台，持续追踪 AI 行业、大模型和 GitHub 开源项目，通过翻译、聚类、双模型分析与证据核验生成可信的个性化信息流、早晚报和周报。

> **自动化状态（2026-08-23）：已暂停。** GitHub Actions 当前没有可用预算，内容采集、摘要投递、生产监控和 Expo 推送回执的定时触发均已移除，只保留人工触发。网站仍可访问，但暂停期间不会自动更新内容或发送通知。恢复前应先配置可用的 Actions 额度或迁移调度平台，再按“数据库迁移 -> Content pipeline -> Digest delivery -> Expo push receipts -> Production monitor”的顺序逐项手动验证并恢复定时触发。

## 技术栈

- Next.js 15、React 19、TypeScript
- PostgreSQL、Supabase、Prisma
- DeepSeek、Qwen
- Resend
- GitHub Actions、PWA、Vercel

## 本地开发

1. 安装依赖：`npm install`
2. 将 `.env.example` 复制为 `.env.local` 并填写配置
3. 生成 Prisma Client：`npm run db:generate`
4. 启动：`npm run dev`

本地地址为 `http://127.0.0.1:3000`。

## 核心任务

- `npm run sources:ingest`：采集公开来源
- `npm run content:process`：清洗、分类、聚类和翻译
- `npm run content:analyze`：生成并验证行业分析
- `npm run reviews:auto-resolve`：自动纠错复审
- `npm run digest:morning`：生成早报
- `npm run digest:evening`：生成晚报
- `npm run digest:weekly`：生成周报

版本范围和状态以 [`docs/roadmap.md`](docs/roadmap.md) 为唯一来源；数据库迁移及数据清理分别见对应 Runbook。

## 当前版本状态

- V0.3.1：已发布的 Web/PWA、学习、微信小程序和实体能力基线。
- V0.4.0 RC：原生 App 发布候选，尚未完成 Expo SDK 57、签名包、真机矩阵和应用商店发布门禁。
- V0.4 稳定性加固：P0/P1/P2 修复已进入代码和正式 migration 链。

## Web/PWA、学习与多端能力

- 可安装 PWA App：Web Push、离线文章、系统语音播报、账户收藏同步
- 微信小程序：`miniprogram/` 可直接导入微信开发者工具，提供轻阅读、报告试读和分享
- 学习中心：访问 `/learning` 查看个性化路线、每日任务与完成进度
- 行为推荐：阅读、收藏、分享、播报和反馈会以时间衰减方式更新主题排序
- 报告导出：决策摘要、研究报告、学习笔记三种模板，支持 HTML/打印 PDF、Markdown 和 JSON

### 环境上线步骤

1. 按 [`docs/database-migration-runbook.md`](docs/database-migration-runbook.md) 创建备份点并执行 `npm run db:migrate:deploy`；禁止在生产执行旧版 `scripts/upgrade-*.sql` 或 `prisma db push`。
2. 生成 VAPID 密钥并配置 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`，定时运行 `npm run push:send`。
3. 在微信公众平台注册小程序，将 `miniprogram/project.config.json` 的 `appid` 和 `miniprogram/app.js` 的域名改为生产值。
4. 在服务端配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 和 `MINI_TOKEN_SECRET`，并在微信后台加入 HTTPS request 合法域名。小程序通过 `wx.login` 获取自己的短期令牌，不需要静态 API Token。

数据保留策略与手动清理步骤见 [`docs/data-retention-runbook.md`](docs/data-retention-runbook.md)。
