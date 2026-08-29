# 配置与 GitHub Actions 审计（2026-08-29）

## 当前仓库状态

- `main` 工作区干净，与 `origin/main` 同步。
- 最新合并提交为 `d748f95`，包含 Edge 全链路验收与搜索、偏好、推送体验修复。
- 当前 6.5 团队与企业版、6.6 多行业扩展按产品决策暂缓。
- 本轮本地 ESLint、Web/测试 TypeScript、单元与策略测试、生产依赖审计均通过。

## Supabase 连接配置

本机 `.env.local` 已有 Supabase 6543 transaction pooler 的 `DATABASE_URL`，用户名符合 `postgres.<project-ref>` 格式，密码存在且未回显。按照 Supabase 的连接格式，可由该池连接安全推导同项目的 5432 direct host；本轮只做了格式校验和只读连通性检查，不修改生产数据库，也没有把完整 `DIRECT_URL` 写入 Git。

实际只读结果：推导的 5432 主机 DNS 不存在，6543 池连接返回 `tenant/user not found`。这表明本机 `.env.local` 的 Supabase 凭据或项目已经失效/被替换，不能作为生产 `DIRECT_URL` 的来源。生产 `https://zhixian.asia/api/health` 当前返回 HTTP 200，数据库状态为 `ok`，线上使用的是另一套有效配置。

生产仍需在 Supabase 控制台的 **Project Settings → Database → Connection string → Direct connection** 复制完整连接串，并分别保存为：

- Vercel 项目的 `DIRECT_URL`（Production、Preview 按实际需要）。
- GitHub Actions repository/environment secret `DIRECT_URL`。

不要把 6543 transaction pooler 地址当作 migration 的 direct URL。迁移工作流 `v02-migration.yml` 和数据保留、回执、趋势工作流都要求这个 Secret；`content-pipeline.yml` 的 fallback 只用于不需要直连的运行时脚本。

## 已配置与缺失项

本地已配置认证、通用/分析 AI、邮件、正式站点 URL、Embedding、VAPID、微信小程序、内部小程序令牌、Product Hunt 和 Vercel OIDC。学习 AI、研究 AI 缺少专用配置时有明确回退：学习使用 Analysis/通用模型，研究代理使用可审计的 `rules-v1`。

仍未在本机配置、且应在对应平台按需补齐的名称：

- `DIRECT_URL`
- 独立的 `UNSUBSCRIBE_TOKEN_SECRET`、`MINI_TOKEN_SECRET`
- `RESEARCH_AI_API_KEY`、`RESEARCH_AI_API_URL`、`RESEARCH_AI_MODEL`（启用模型研究时）
- `LEARNING_AI_API_KEY`、`LEARNING_AI_API_URL`、`LEARNING_AI_MODEL`（启用专用学习模型时）
- `GITHUB_TOKEN`（本地趋势采集可选；Actions 使用内置 `github.token`）
- `GITHUB_TREND_REPOS`、`TREND_PAPER_TOPICS_JSON`、`TREND_FEEDS_JSON`（必须由运营明确仓库、论文主题和合法授权源）
- 移动发布相关 `EXPO_TOKEN`、`EXPO_PUBLIC_EAS_PROJECT_ID`、`SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT`、`EXPO_PUBLIC_SENTRY_DSN`
- `ALERT_EMAIL_TO`（开启失败告警邮件时）

没有业务选择或平台授权前，不应伪造趋势源、招聘源、模型/论文许可或第三方 Token。`.env.example` 已列出完整变量和安全约束。

## GitHub Actions 账单与额度

由于仓库是私有仓库，未认证的 GitHub API 返回 404；本机 `gh auth status` 显示 `CoderDongHuang` token 已失效，因此无法读取账户级 Actions 分钟数、spending limit 或账单页面。仓库 Git push 本身正常，代码问题不再是当前失败主因。尝试打开 Supabase 项目数据库设置时，独立 Edge 会话显示登录页；浏览器插件内核当前无法接管你已有的 Edge 登录态，因而没有读取或猜测控制台中的连接串。

GitHub 账户持有人应在浏览器打开 **Settings → Billing & licensing → Plans and usage**：

1. 查看 Actions minutes、Artifact storage 和当前账单周期的用量。
2. 在 **Budgets and alerts** 检查 Actions budget/spending limit 是否为 0，或是否因付款失败被暂停。
3. 私有仓库超出套餐月度分钟数时，添加有效付款方式并把 Actions spending limit 调到允许的非零金额；组织仓库还需在组织 **Settings → Billing & licensing** 处理预算/付款。
4. 若不希望产生付费，等待下个账单周期重置、减少运行频率/矩阵，或将公开仓库的 Actions 与私有生产任务分开。公开仓库与私有仓库的免费分钟政策不同，以当前 GitHub 账户页面显示为准。
5. 账单恢复后先手动运行 `V0.4 quality gate`，再按 `docs/mobile/release-runbook.md` 顺序运行数据库迁移、内容流水线、简报投递和回执任务。当前生产定时工作流仍是手动触发，避免恢复后产生重复投递。

质量门禁现已按 Git ref 加并发取消，同一分支的新提交会取消旧的排队/运行检查，避免重复消耗 Actions 分钟；这不能绕过当前账单额度，但可减少后续浪费。

## 本轮工作流修复

`content-pipeline.yml` 原先设置 `TZ: Asia/Shanghai` 却使用 `date -u` 读取 UTC 时间，恢复调度时会在错误的小时生成早报、晚报或周报。现已改用 `TZ=Asia/Shanghai date`，并增加 `content-pipeline` 并发锁，防止重复运行造成重复内容和推送。

## 待人工确认

- 用已登录 Edge 查看 Supabase Direct connection 并配置 Vercel/GitHub Secret。
- 用已登录 GitHub 查看 Actions 账单/额度并恢复有效预算。
- 在普通 Edge 用户配置中完成一次浏览器推送真实送达。
- 完成 Android、iPhone、iPad 真机矩阵及 48 小时 soak test。
