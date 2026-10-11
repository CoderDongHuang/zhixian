# AI 预算与账单对账

更新：2026-10-11。第一批预算代码完成，本机策略、Lint 和类型通过；本机 Docker 启动失败，PostgreSQL 集成和完整链路由 GitHub 隔离库验收，结果待更新。第二批账单对账工具仍待完成。未配置真实个人金额、调用收费模型、部署生产迁移或恢复 cron。

## 预算准入

先部署 `20261011000100_ai_budget`。所有已接入遥测的翻译、分析、实体、简报、研究、学习、向量和模型诊断调用共用 PostgreSQL 台账。数据库事务锁串行预留与结算；按数据库 UTC 日期累计，不按模型、提供商、任务或进程拆分额度。每次请求先占用金额和次数，已知成本结算后只退金额差额，不退次数。删除 `AiCall` 不释放预留。

配置示例仅展示格式，不代表建议金额：

```dotenv
AI_BUDGET_ENFORCE=true
AI_BUDGET_JSON='{"dailyLimitUsd":"1.00","reservationUsd":"0.10","maxCallsPerDay":20,"maxInputBytes":20000,"maxOutputTokens":1000}'
AI_PRICING_JSON='{"provider-host/model":{"version":"price-date","inputPerMillion":2,"outputPerMillion":4}}'
```

USD 必须是十进制字符串，最多六位小数；数据库以整数微美元累计。五个预算字段必须齐全，拒绝未知字段、非法或溢出值。价格必须对应真实 endpoint 主机（含端口）与模型，并经供应商当前价目核实。`AI_BUDGET_ENFORCE=true` 时缺预算或该模型价格会在发请求前失败。只要配置了非空 `AI_BUDGET_JSON` 就启用，即使 enforce=false。两项都未配置才兼容旧行为，不限制准入。生产手动内容流水线已要求 enforce=true，必须同步设置 GitHub Secrets 与应用环境。

拒绝超输入 UTF-8 字节上限、多候选输出、流式请求和模型不一致；对 Chat 请求限制 `max_tokens` / `max_completion_tokens`，未提供时补上输出上限，禁止 HTTP 自动重定向。输入上限指请求 JSON 字节，包含正文和 JSON 开销，不是 tokenizer 精确 token 数。

未知用量、无可计价返回或网络错误保留预留并记 UNCERTAIN；成本超过单次预留记 OVER_LIMIT；进程死亡或落库失败保留 RESERVED，五分钟后阻止新请求。上述未解决项跨 UTC 日期仍阻止调用。监控给出 INVALID_CONFIG、UNCERTAIN、EXHAUSTED 警告；新一天不自动抹掉风险。不要删除台账或把未知费用改成零来恢复调用；先核对供应商记录、保留审计并决定恢复策略。当前没有自动解锁/核销工具。

预算保证的是本项目数据库账本与预留下的准入金额、调用次数及请求大小限制。固定单次预留依赖运营者设置；供应商返回的真实费用可能超预留，已经发出的调用与已经准入的并发无法撤销。额外 token 类型、缓存/工具/图像费用、错误费率、账户其他调用、税费与汇率均可能造成差异。因此这不是供应商账户账单绝对硬上限，应配合供应商自身额度和告警。不要在界面或发行材料承诺绝对零超支。

## 验收与待办

- [x] 策略、金额解析、请求限制、全局事务预留/结算、次数保留、失败保留与运维告警代码；专项已纳入默认 unit 和 CI，CI 无隔离数据库将失败而不是静默跳过。
- [ ] 两个 Prisma 客户端、20 并发 HTTP 请求的真实 PostgreSQL 验收，超额/未知/昨日不确定/结算失败反例；本机 Docker 阻塞，等待 GitHub run。
- [ ] 本提交的 GitHub 完整 quality gate。
- [ ] 供应商账单对账工具（第二批）。
- [ ] 用户确认实际预算、核实真实费率，配置生产/GitHub/Vercel 并实际验收；供应商账户自身硬额度、真实账单对账和恢复流程仍待完成。
