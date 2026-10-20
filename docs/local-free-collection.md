# 本机免费采集

项目已有 OpenAI News / arXiv RSS、GitHub 仓库搜索、Hacker News 和 Stack Overflow 公开接口，无需另购采集器。GitHub API 限流与 GitHub Actions 运行分钟是不同额度；未配置 GitHub token 时仍可用较低的匿名接口额度。

Windows 安装 Node.js 22、`npm ci` 并在项目 `.env` 配置有效生产 `DATABASE_URL` 后，执行：

```powershell
powershell -NoProfile -File scripts/install-local-collection.ps1
```

任务 `ZhiXian-Free-Collection` 每天本地时间 08:15、20:15 运行。只在当前 Windows 用户登录、电脑开机联网时执行；错过计划会在条件恢复后补跑，重复运行不重叠，55 分钟超时，失败后每隔 30 分钟最多重试 3 次。无需存储 Windows 密码。首次可通过 `Start-ScheduledTask -TaskName ZhiXian-Free-Collection` 或 `npm run pipeline:local` 立即验证；`npm run sources:collect:free` 仍只采集、不调用模型。

日志在忽略提交的 `test-results/local-collection`，保留 14 天。任务状态通过 `Get-ScheduledTaskInfo -TaskName ZhiXian-Free-Collection` 查看，`LastTaskResult=0` 表示最近成功。日志和 `.env` 可能包含内部信息，不应分享或提交。卸载用 `Unregister-ScheduledTask -TaskName ZhiXian-Free-Collection`。

默认只采集、去重、保存原始材料及来源快照。首页“最新采集”直接展示公开原文链接；“已核验分析”仍仅展示通过现有证据、独立核验与新鲜度检查的发布内容。原有 GitHub 内容流水线继续暂停。

## 本机通义免费额度分析（可选）

2026-10-20 在已登录百炼控制台核验：`qwen3.8-flash` 和 `qwen3.8-27b` 各有约 100 万免费 Token，分别在 2026-11-25 和 2026-11-17 到期，均已开启平台“免费额度用完即停”。两模型已用现有 DashScope key 实测连通。免费额度是平台赠送的限时额度，并非永久免费；以控制台实时余额为准。

在仅本机使用的 `.env` 中配置：

```dotenv
ANALYSIS_AI_API_URL="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
ANALYSIS_AI_API_KEY="填写自己的百炼密钥"
LOCAL_FREE_AI_ENABLED="true"
# 必须先在控制台为两个模型确认开启用完即停
LOCAL_FREE_AI_STOP_CONFIRMED="true"
# 按两个模型较早到期日保守停止；不能直接延长，须重新核验额度
LOCAL_FREE_AI_EXPIRES_AT="2026-11-17T00:00:00+08:00"
```

本机任务用 Flash 翻译、分析，27B 独立核验；每轮最多处理最新 10 篇、分析 3 个事件，每个上海自然日最多 60 次调用（失败也计数，依赖数据库遥测正常写入，计划任务不重叠）。额度耗尽、日期到期或配置不全就停止 AI，不会切换到已有付费模型；免费采集照常执行。每日调用上限是本机串行任务的节流，平台用完即停才是实际计费保护。不要关闭控制台保护，也不要把这些本机开关放入其他同时执行的任务。默认不嵌入、不发送邮件或推送。手动只补分析可用 `node --use-system-ca scripts/run-local-pipeline.mjs --analyze-only`。日志会保留阶段与发布结果，不输出密钥。

额度保护会限制服务连续性，故原始资讯始终独立显示。到期后采集继续，AI 需要重新核验可用免费模型与平台停止开关。

2026-10-19 核查：8 月最后一次采集失败注释明确为付款/预算限制；10 月 19 日 quality gate 实际成功运行。当前 GitHub CLI 授权缺少账单读取范围，无法据此确认账户剩余分钟。余额以 [GitHub Billing](https://github.com/settings/billing) 为准。

其他免费软件选择包括 [RSSHub](https://docs.rsshub.app/) 和 [FreshRSS](https://freshrss.org/)；自托管仍需要机器运行。当前项目已有采集脚本，本机计划任务可以直接复用。
