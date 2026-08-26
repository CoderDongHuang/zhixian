import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { forecastInvalidationReasons, formatTrendValue, isTrendCategory, parseTrendWindow, PRIMARY_TREND_METRIC, selectComparableSnapshots, TREND_METRICS, trendChange, type TrendCategoryValue } from "@/lib/trend-policy.mjs";

export const dynamic = "force-dynamic";

const categoryLabels: Record<TrendCategoryValue, string> = { GITHUB: "GitHub", MODEL_PRODUCT: "模型与产品", PAPER: "论文", JOB: "招聘" };

export default async function TrendsPage({ searchParams }: { searchParams: Promise<{ category?: string; days?: string }> }) {
  const params = await searchParams;
  const category = isTrendCategory(params.category) ? params.category : null;
  const days = parseTrendWindow(params.days);
  const cutoff = new Date(Date.now() - days * 86400000);
  const subjects = await prisma.trendSubject.findMany({
    where: { enabled: true, ...(category ? { category } : {}) },
    include: { snapshots: { where: { observedAt: { gte: cutoff } }, orderBy: { observedAt: "desc" }, take: 100 }, forecasts: { where: { horizonDays: 30 }, orderBy: { generatedAt: "desc" }, take: 20 } },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });
  return <main className="trend-shell"><header><Link href="/">返回信息流</Link><p className="eyebrow">趋势监测 V0.1</p><h1>可解释指标，而不是黑箱判断</h1><p>查看原始值、计算方法、观察窗口、来源许可和已知缺口。预测只在样本足够且完成回测时显示。</p></header>
    <form className="trend-filters"><fieldset><legend>领域</legend><div className="segmented"><label><input type="radio" name="category" value="" defaultChecked={!category} />全部</label>{Object.entries(categoryLabels).map(([value, label]) => <label key={value}><input type="radio" name="category" value={value} defaultChecked={category === value} />{label}</label>)}</div></fieldset><fieldset><legend>观察窗口</legend><div className="segmented">{[7, 30, 90].map((window) => <label key={window}><input type="radio" name="days" value={window} defaultChecked={days === window} />{window} 天</label>)}</div></fieldset><button type="submit">应用</button></form>
    <section className="trend-grid">{subjects.length === 0 ? <div className="empty-state"><h2>当前窗口暂无趋势数据</h2><p>运行经过授权的趋势采集后，这里会显示时间序列。单次观测不会被描述为趋势。</p></div> : subjects.map((subject) => {
      const primaryKey = PRIMARY_TREND_METRIC[subject.category];
      const definition = TREND_METRICS[subject.category][primaryKey];
      const snapshots = selectComparableSnapshots(subject.snapshots);
      const points = snapshots.flatMap((snapshot) => { const value = Number((snapshot.metrics as Record<string, unknown>)[primaryKey]); return Number.isFinite(value) ? [{ at: snapshot.observedAt, value }] : []; });
      const latest = snapshots.at(-1);
      const latestValue = points.at(-1)?.value;
      const change = trendChange(points);
      const forecast = subject.forecasts.find((item) => item.metricKey === primaryKey);
      const invalidationReasons = forecastInvalidationReasons(forecast, points.at(-1));
      const gaps = latest?.dataGaps || [];
      const detailHref = `/trends/${subject.slug}?days=${days}`;
      return <article className="trend-card" key={subject.id}><header><div><span>{categoryLabels[subject.category]}</span><h2><a href={detailHref}>{subject.name}</a></h2></div><strong>{formatTrendValue(latestValue, definition.unit)}</strong></header><div className="trend-delta"><span>{definition.label}</span><b>{change ? `${change.absolute >= 0 ? "+" : ""}${formatTrendValue(change.absolute, definition.unit)}` : "至少需要两个观测点"}</b><small>{change?.percent === null || change?.percent === undefined ? "" : `${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(1)}%`}</small></div><dl><div><dt>窗口</dt><dd>{days} 天历史 · {latest?.windowDays || 30} 天指标口径 · {points.length} 个点</dd></div><div><dt>方法</dt><dd>{definition.method}</dd></div><div><dt>来源</dt><dd><a href={subject.sourceUrl} target="_blank" rel="noreferrer">{subject.sourceName}</a>{subject.sourceLicense ? ` · ${subject.sourceLicense}` : " · 许可未标注"}</dd></div></dl>{gaps.length > 0 && <aside><strong>数据缺口</strong><ul>{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></aside>}<footer>{forecast ? invalidationReasons.length ? <span>预测待更新 · {invalidationReasons[0]}</span> : <span>30 天预测已回测 · MAE {formatTrendValue(forecast.backtestMae, definition.unit)}</span> : <span>预测样本不足，至少需要 6 个有效时间点</span>}<a href={detailHref}>查看原始数据</a></footer></article>;
    })}</section>
  </main>;
}
