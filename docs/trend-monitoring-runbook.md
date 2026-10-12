# 趋势监测 V0.1 运行手册

更新日期：2026-08-26

趋势监测只呈现可追溯指标，不执行通用市场预测。生产启用前先执行正式迁移，并确认每个数据源的授权、统计口径和缺口说明。

## 数据模型

- `TrendSubject`：趋势主体、分类、来源、许可和计算方法。
- `TrendSnapshot`：某一观察时点的原始指标、维度、窗口和已知缺口，保留 730 天。
- `TrendForecast`：30 天基础预测、80% 区间、滚动回测误差、训练窗口和失效条件，保留 365 天。
- 既有 `SourceSnapshot` 仍保存原始采集证据；趋势快照不替代来源快照。

## 数据源配置

### GitHub

设置 `GITHUB_TREND_REPOS=owner/repo,owner/other-repo`。采集 Stars、Forks、贡献者分页总数、30 天 Release 数和 30 天新建 Issue 数。建议配置 `GITHUB_TOKEN`，否则匿名 API 频率限制会写入数据缺口。

未配置专用仓库时，采集器会转换既有 GitHub `SourceSnapshot`，但明确标记贡献者、发布频率和 Issue 速度缺失。

### 论文

`TREND_PAPER_TOPICS_JSON` 示例：

```json
[{"slug":"ai-papers","name":"AI Papers","conceptId":"C154945302","windowDays":30}]
```

论文量取 OpenAlex 窗口总数；引用量与机构分布最多基于前 200 篇样本。样本未覆盖全部结果时页面会显示缺口。OpenAlex 数据为 CC0。

### 模型、产品与招聘

`TREND_FEEDS_JSON` 只接受团队审核过、不含 URL 内嵌凭据的 HTTPS JSON 源。响应可以是单个观测对象，也可以是最多 100 个观测对象组成的数组或 `{ "observations": [...] }`：

```json
{
  "observedAt": "2026-08-26T00:00:00Z",
  "windowDays": 30,
  "metrics": {"jobCount": 120, "medianSalary": 35000, "remoteShare": 18, "skillCoverage": 24},
  "dimensions": {"skills": ["Python", "LLM"], "regions": ["上海", "深圳"], "salarySamples": 80},
  "dataGaps": ["不包含未授权平台"]
}
```

配置项需提供 `category`、`slug`、`name`、`endpoint`、`sourceName`、`sourceUrl`、`sourceLicense` 和 `methodology`，且这里只允许 `MODEL_PRODUCT` 与 `JOB` 分类。任何通用 feed 缺少 `sourceLicense` 时采集器都会拒绝。Bearer Token 的变量名必须以 `TREND_FEED_TOKEN_` 开头，并通过 `authorizationEnv` 引用；配置了变量名但环境中缺少令牌时任务会失败，不会降级为匿名请求。不得把令牌写入 JSON 配置或仓库。

## 执行顺序

1. 备份并执行 `npm run db:migrate:deploy`。
2. 执行 `npm run trends:collect`。
3. 检查 `PipelineRun` 的 `trend-collect` 结果与页面数据缺口。
4. 执行 `npm run trends:forecast`。
5. 在 `/trends` 检查来源、窗口、原始数据和预测失效状态。

趋势变化和预测只比较与最新快照 `windowDays` 相同的数据，避免混合不同统计口径。预测至少需要跨越 5 天的 6 个有效点。模型采用最小二乘线性趋势和扩展窗口滚动回测；没有足够样本时不会创建预测。训练窗口后出现新快照、来源口径变化、最新观测超出预测区间、连续 7 天没有新数据，或预测目标日期已过时，预测会标记为失效并等待重新生成或人工评估。

## 当前调度状态

2026-10-12 核对：最近完整 CI 已成功，不能继续将当前运行状态描述为账户额度阻断；当前剩余额度尚未核验。`Trend monitoring` 没有 `schedule`，生产调度按用户运营决定继续暂停。恢复前需确认运营计划和预算，并依次验证生产数据库迁移、真实来源、趋势采集、预测生成和页面展示。
