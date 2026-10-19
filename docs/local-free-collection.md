# 本机免费采集

项目已有 OpenAI News / arXiv RSS、GitHub 仓库搜索、Hacker News 和 Stack Overflow 公开接口，无需另购采集器。GitHub API 限流与 GitHub Actions 运行分钟是不同额度；未配置 GitHub token 时仍可用较低的匿名接口额度。

Windows 安装 Node.js 22、`npm ci` 并在项目 `.env` 配置有效生产 `DATABASE_URL` 后，执行：

```powershell
powershell -NoProfile -File scripts/install-local-collection.ps1
```

任务 `ZhiXian-Free-Collection` 每天本地时间 08:15、20:15 运行。只在当前 Windows 用户登录、电脑开机联网时执行；错过计划会在条件恢复后补跑，重复运行不重叠，20 分钟超时，失败后每隔 30 分钟最多重试 3 次。无需存储 Windows 密码。首次可通过 `Start-ScheduledTask -TaskName ZhiXian-Free-Collection` 或 `npm run sources:collect:free` 立即验证。

日志在忽略提交的 `test-results/local-collection`，保留 14 天。任务状态通过 `Get-ScheduledTaskInfo -TaskName ZhiXian-Free-Collection` 查看，`LastTaskResult=0` 表示最近成功。日志和 `.env` 可能包含内部信息，不应分享或提交。卸载用 `Unregister-ScheduledTask -TaskName ZhiXian-Free-Collection`。

此任务只采集、去重、保存原始材料及来源快照，不调用 AI、不翻译、不嵌入、不发布分析或发送通知，因此不会消耗 GitHub Actions 分钟或模型额度。新材料进入数据库不等于首页已生成中文分析：完整分析仍需另外配置模型及预算。原有 GitHub 内容流水线继续暂停。

2026-10-19 核查：8 月最后一次采集失败注释明确为付款/预算限制；10 月 19 日 quality gate 实际成功运行。当前 GitHub CLI 授权缺少账单读取范围，无法据此确认账户剩余分钟。余额以 [GitHub Billing](https://github.com/settings/billing) 为准。

其他免费软件选择包括 [RSSHub](https://docs.rsshub.app/) 和 [FreshRSS](https://freshrss.org/)；自托管仍需要机器运行。当前项目已有采集脚本，本机计划任务可以直接复用。
