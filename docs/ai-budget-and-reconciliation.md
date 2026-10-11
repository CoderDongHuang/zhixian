# AI 预算与账单对账

更新：2026-10-11。第一批预算代码已推送 `ff0fd8c`，[GitHub run 38119680197](https://github.com/CoderDongHuang/zhixian/actions/runs/38119680197) 中预算真实 PostgreSQL/HTTP 10/10 通过、skip 0；该次完整 CI 因专题编辑页面未更新失败，见 [刷新补修](research-collection-refresh-2026-10-11.md)。本机 Docker 已恢复，预算 10/10、第二批只读账单对账真实 PostgreSQL/CLI 11/11 均通过、skip 0，Lint/类型/Prisma 校验通过。补修后的完整 CI 待验收。未配置真实个人金额、调用收费模型、部署生产迁移或恢复 cron。

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
- [x] 两个 Prisma 客户端、20 并发 HTTP 请求的真实 PostgreSQL 验收，超额/未知/昨日不确定/结算失败反例；本机及上述 GitHub run 10/10、skip 0。
- [x] 预算和专题补修的 GitHub 完整 quality gate：[run 38120827548](https://github.com/CoderDongHuang/zhixian/actions/runs/38120827548) 全部通过；第二批对账工具的完整 CI 另行验收。
- [x] 供应商账单对账工具及本机真实 PostgreSQL/HTTP/CLI 验收（第二批），11/11、skip 0；GitHub 验收待更新。
- [ ] 用户确认实际预算、核实真实费率，配置生产/GitHub/Vercel 并实际验收；供应商账户自身硬额度、真实账单对账和恢复流程仍待完成。

## 只读账单对账

先部署 `20261011000200_ai_bill_request_ids`。遥测记录安全且限长的 `x-request-id`，缺失/不合法则尝试 `request-id`，再尝试响应 JSON `id`；不保存请求/响应正文。这三个值不是所有供应商都可互换，账单导出中的编号必须与实际记录一致。历史调用没有编号时明确未匹配，不用时间或模型名称猜测关联。

将供应商原始导出在本机转换为以下严格格式，文件放在已忽略的 `.local-ai-billing/` 或仓库外，不能上传提示词、密钥或个人账单。示例是假数据，仅展示格式；工具不会自动登录、下载或编造真实账单。

```json
{
  "version": 1,
  "currency": "USD",
  "provider": "api.example.com",
  "periodStart": "2026-10-01T00:00:00Z",
  "periodEnd": "2026-11-01T00:00:00Z",
  "entries": [
    {"requestId": "req-example", "model": "actual-model", "billedUsd": "0.000400"}
  ]
}
```

时间必须是 UTC Z 格式，起点包含、终点不包含，窗口不超过 366 天。provider 是实际 API 主机（可含非默认端口），不是品牌名或完整 URL。每笔 USD 必须是非负十进制字符串，最多六位小数；不接收其他货币、税、退款/抵扣或非调用费用。此类金额须在供应商总账另行核对。最多 5 MiB / 50,000 条账单和 100,000 条本地调用；超限明确失败，不能截断后宣称对账成功。

```powershell
npm run ai:reconcile -- .local-ai-billing/bill.json
```

CLI 仅 SELECT，不修改 `AiCall` 或预算，也不自动核销/解锁不确定状态。需 DATABASE_URL 的读权限和最新迁移；不要用账号总账混合其他应用/账户范围后期望一一匹配。时间窗按本地调用记录写入时刻筛选，与供应商按请求开始/记费时刻可能存在边界差异，需在导出转换时核对并明确口径。

按精确编号和模型一一关联。重复账单编号/本地编号、未匹配双方、缺编号、未知价格/用量、失败传输、模型冲突、金额差异均为 REVIEW_REQUIRED；重复编号不选择任意一条。估算按微美元四舍五入后比较，账单金额保持精确整数；比较差额只覆盖双方金额已知且无歧义的记录，不能将未知费用当零，也不能把局部相等称为全账单一致。报告只含计数、金额与窗口，不输出供应商请求编号、模型、密钥、文件路径或原文。

退出码：0 = 此窗口/范围内记录全部匹配；2 = 对账成功执行但存在复核项；1 = 参数/账单/迁移/数据库等不可用。0 不证明导出完整、价目正确、账户总账/税费一致或研究业务成功；真实供应商实测与总账验收仍是独立待办。记录供应商账单 ID、来源/导出时间、转换规则、报告和复核结论到个人发行凭证中。

默认 unit 与 CI 包含实际本地 HTTP 返回编号、真实 PostgreSQL 保存、真实 CLI 退出码及只读前后数据对照。测试用量来自 mock，不冒充真实供应商账单。
