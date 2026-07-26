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
