# 知线 Zhixian

AI 行业研究平台，持续追踪 AI 行业、大模型和 GitHub 开源项目，通过翻译、聚类、双模型分析与证据核验生成可信的个性化信息流、早晚报和周报。

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

架构和扩展路线见仓库内两份中文设计文档。

## V0.3 移动端与学习能力

- 可安装 PWA App：Web Push、离线文章、系统语音播报、账户收藏同步
- 微信小程序：`miniprogram/` 可直接导入微信开发者工具，提供轻阅读、报告试读和分享
- 学习中心：访问 `/learning` 查看个性化路线、每日任务与完成进度
- 行为推荐：阅读、收藏、分享、播报和反馈会以时间衰减方式更新主题排序
- 报告导出：决策摘要、研究报告、学习笔记三种模板，支持 HTML/打印 PDF、Markdown 和 JSON

### V0.3 上线步骤

1. PowerShell 执行 `Get-Content -Raw scripts/upgrade-v03.sql | node --env-file-if-exists=.env.local scripts/apply-sql.mjs` 升级数据库。
2. 生成 VAPID 密钥并配置 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`，定时运行 `npm run push:send`。
3. 在微信公众平台注册小程序，将 `miniprogram/project.config.json` 的 `appid` 和 `miniprogram/app.js` 的域名改为生产值。
4. 在服务端配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 和 `MINI_TOKEN_SECRET`，并在微信后台加入 HTTPS request 合法域名。小程序通过 `wx.login` 获取自己的短期令牌，不需要静态 API Token。
