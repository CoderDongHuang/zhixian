# 知线 Zhixian

AI 行业研究平台，持续追踪 AI 行业、大模型和 GitHub 开源项目，通过翻译、聚类、双模型分析与证据核验生成可信的个性化信息流、早晚报和周报。

最新可用网站：[zhixian.asia](https://zhixian.asia)。2026-10-12 已完成三端界面与故障恢复、应用 public schema 备份和实际恢复、生产 20 项 migration/checksum 核验；线上首页缺列异常已消失，公开页面及匿名导航已实测。472 历史分析按新鲜度规则失效，采集继续暂停，首页可能无新内容。完整生产业务、真实服务及原生/微信真机仍待验收，当前状态以 [路线图](docs/roadmap.md) 为准，详见 [三端记录](docs/三端界面重构与验收-2026-10-12.md) 与 [恢复记录](docs/production-recovery-2026-10-12.md)。

> **自动化状态（2026-10-11）：定时任务仍暂停。** 内容采集、摘要投递、生产监控、趋势和 Expo 推送回执仅保留人工触发。八月 Actions 曾因付款/预算被拒绝启动，十月完整 quality gate 已实际运行成功；当前账户剩余额度仍未核验。暂停期间自动化不会更新内容或发送通知。恢复前须确认账单或调度方案，按“数据库迁移 -> Content pipeline -> Digest delivery -> Expo push receipts -> Production monitor”的顺序逐项验证；手动收费内容流程现要求 [AI 预算与费率配置](docs/ai-budget-and-reconciliation.md)。依赖安全门禁已修复，后续提交仍须通过。最新问题与发行边界见 [10 月复核](docs/项目复核与个人版建设建议-2026-10-09.md)。

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

运行 `npm run configuration:check` 安全检查有效本地配置；添加 `-- --database` 才进行只读连接、迁移台账和向量列核验。生产约束使用 `-- --production`，它不会自动读取远程平台配置，也不证明可以发行。命令与当前缺口见 [配置预检记录](docs/release-preflight-2026-10-12.md)。

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
- V0.4.0 RC：原生 App 发布候选，依赖整改及安全门禁已通过；签名包、真机矩阵和应用商店发布仍待验收。
- V0.4 稳定性加固：P0/P1/P2 修复已进入代码和正式 migration 链。
- V0.5 数据质量：材料/审核版本、任务租约/重放、成本监控、共享预算准入与只读账单对账已完成代码、隔离/CI 与生产表迁移；真实费率和供应商账单另行验收。
- V0.6 可信研究工作台：六个优先方向已开发完成并通过本地全链路及生产迁移，真实登录后业务与用户验收仍待完成。
- V0.7 趋势监测 V0.1：GitHub、模型/产品、论文和授权招聘指标、解释卡片及基础回测预测已开发完成，尚待生产数据源配置与发布。
- V0.8 可信研究代理 V0.1：专题限定问答、逐事实引用、对象比较、30 天变化和确认式报告已开发完成，尚待生产模型与真实数据验收。
- 学习升级（6.4）：事件实践、知识检查、间隔复习和质量自适应已有实现；提交幂等与每日任务边界已修复并通过隔离回归，生产与真实用户验收仍待完成。

上述“开发完成”不代表完整生产业务验收。依赖门禁、认证、分析新鲜度与证据边界的代码整改、生产迁移和公开页面已通过核验；平台配置、人工质量与原生真机仍需单独验收，见 [后续扩展路线](AI行业研究平台-后续扩展路线.md)。本轮专题保存刷新和 Edge 推送补修分别见 [专题记录](docs/research-collection-refresh-2026-10-11.md) 与 [推送记录](docs/edge-push-test-2026-10-11.md)。

## Web/PWA、学习与多端能力

- 可安装 PWA App：Web Push、离线文章、系统语音播报、账户收藏同步
- 微信小程序：`miniprogram/` 可直接导入微信开发者工具，提供轻阅读、报告试读和分享
- 学习中心：访问 `/learning` 完成绑定真实事件与实体的 15 分钟实践、知识检查、错题间隔复习和质量自适应路线
- 行为推荐：阅读、收藏、分享、播报和反馈会以时间衰减方式更新主题排序
- 报告导出：决策摘要、研究报告、学习笔记三种模板，支持 HTML/打印 PDF、Markdown 和 JSON
- 可信研究工作台：访问 `/research` 管理实体关注、研究专题、个人笔记、纠错通知和只读分享；实体 7/30/90 天变化位于 `/research/timeline`
- 证据对照：事件详情将研究结论与支持、冲突、背景证据并列展示，分享页冻结来源、更新时间和版本号
- 趋势监测：访问 `/trends` 查看四类原始指标、方法、窗口、许可、缺口，以及带回测误差、80% 区间和失效条件的 30 天基础预测
- AI 问答与研究代理：访问 `/research/agent`，从自有专题冻结证据、审阅大纲并生成逐事实引用报告；无模型配置时使用确定性规则模式

### 环境上线步骤

1. 按 [`docs/database-migration-runbook.md`](docs/database-migration-runbook.md) 创建备份点并执行 `npm run db:migrate:deploy`；禁止在生产执行旧版 `scripts/upgrade-*.sql` 或 `prisma db push`。
2. 生成 VAPID 密钥并配置 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`，定时运行 `npm run push:send`。
3. 在微信公众平台注册小程序，将 `miniprogram/project.config.json` 的 `appid` 和 `miniprogram/app.js` 的域名改为生产值。
4. 在服务端配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 和 `MINI_TOKEN_SECRET`，并在微信后台加入 HTTPS request 合法域名。小程序通过 `wx.login` 获取自己的短期令牌，不需要静态 API Token。

数据保留策略与手动清理步骤见 [`docs/data-retention-runbook.md`](docs/data-retention-runbook.md)。
趋势数据源、许可要求和人工运行步骤见 [`docs/trend-monitoring-runbook.md`](docs/trend-monitoring-runbook.md)。
研究代理的证据边界、模型配置、状态恢复和上线检查见 [`docs/research-agent-runbook.md`](docs/research-agent-runbook.md)。
