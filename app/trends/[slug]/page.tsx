import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { forecastInvalidationReasons, formatTrendValue, parseTrendWindow, selectComparableSnapshots, TREND_METRICS, trendChange } from "@/lib/trend-policy.mjs";

export const dynamic = "force-dynamic";

type MetricMap = Record<string, unknown>;
type DimensionMap = Record<string, unknown>;

export default async function TrendDetail({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ days?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const days = parseTrendWindow(query.days);
  const subject = await prisma.trendSubject.findUnique({ where: { slug }, include: { snapshots: { orderBy: { observedAt: "desc" }, take: 365 }, forecasts: { where: { horizonDays: 30 }, orderBy: { generatedAt: "desc" }, take: 100 } } });
  if (!subject || !subject.enabled) notFound();
  const cutoff = Date.now() - days * 86400000;
  const snapshots = selectComparableSnapshots(subject.snapshots).filter((item) => item.observedAt.getTime() >= cutoff);
  const definitions = TREND_METRICS[subject.category] as Record<string, { label: string; unit: string; method: string }>;
  const latestForecasts = new Map<string, typeof subject.forecasts[number]>();
  for (const forecast of subject.forecasts) if (!latestForecasts.has(forecast.metricKey)) latestForecasts.set(forecast.metricKey, forecast);
  const latest = snapshots.at(-1);
  const maxByMetric = Object.fromEntries(Object.keys(definitions).map((key) => [key, Math.max(1, ...snapshots.map((snapshot) => Number((snapshot.metrics as MetricMap)[key]) || 0))]));
  return <main className="trend-shell"><header><Link href={`/trends?category=${subject.category}&days=${days}`}>返回趋势监测</Link><p className="eyebrow">{subject.name}</p><h1>{subject.description || "指标历史与基础预测"}</h1><p>{subject.methodology}</p><div className="trend-provenance"><span>来源：<a href={subject.sourceUrl} target="_blank" rel="noreferrer">{subject.sourceName}</a></span><span>许可：{subject.sourceLicense || "未标注"}</span><span>最近采集：{latest?.sourceFetchedAt.toLocaleString("zh-CN", { hour12: false }) || "暂无"}</span></div></header>
    <form className="trend-window"><fieldset><legend>观察窗口</legend><div className="segmented">{[7, 30, 90].map((window) => <label key={window}><input type="radio" name="days" value={window} defaultChecked={days === window} />{window} 天</label>)}</div></fieldset><button type="submit">查看</button></form>
    {snapshots.length === 0 ? <p className="empty-state">该窗口内没有观测数据。</p> : <>{Object.entries(definitions).map(([key, definition]) => {
      const points = snapshots.flatMap((snapshot) => { const value = Number((snapshot.metrics as MetricMap)[key]); return Number.isFinite(value) ? [{ at: snapshot.observedAt, value }] : []; });
      if (!points.length) return null;
      const change = trendChange(points);
      const forecast = latestForecasts.get(key);
      const invalidationReasons = forecastInvalidationReasons(forecast, points.at(-1));
      return <section className="trend-series" key={key}><header><div><h2>{definition.label}</h2><p>{definition.method}</p></div><strong>{formatTrendValue(points.at(-1)?.value, definition.unit)}</strong></header><div className="trend-bars" aria-label={`${definition.label}历史数据`}>{points.map((point) => <div key={point.at.toISOString()}><span style={{ height: `${Math.max(4, point.value / maxByMetric[key] * 100)}%` }} /><small>{point.at.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small><b>{formatTrendValue(point.value, definition.unit)}</b></div>)}</div><p className="trend-change">窗口变化：{change ? `${change.absolute >= 0 ? "+" : ""}${formatTrendValue(change.absolute, definition.unit)}${change.percent === null ? "" : `（${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(1)}%）`}` : "观测点不足"}</p>{forecast ? <article className={`forecast-panel${invalidationReasons.length ? " invalid" : ""}`}><div><span>30 天基础预测</span><strong>{formatTrendValue(forecast.forecastValue, definition.unit)}</strong></div><p>80% 区间：{formatTrendValue(forecast.lowerBound, definition.unit)} 至 {formatTrendValue(forecast.upperBound, definition.unit)}</p><dl><div><dt>方法</dt><dd>{forecast.method}</dd></div><div><dt>回测</dt><dd>MAE {formatTrendValue(forecast.backtestMae, definition.unit)}{forecast.backtestMape === null ? "" : ` · MAPE ${forecast.backtestMape.toFixed(1)}%`}</dd></div><div><dt>训练样本</dt><dd>{forecast.sampleSize} 个 · {forecast.trainingWindowStart.toLocaleDateString("zh-CN")} 至 {forecast.trainingWindowEnd.toLocaleDateString("zh-CN")}</dd></div><div><dt>失效条件</dt><dd>{forecast.invalidationRule}</dd></div></dl>{invalidationReasons.length > 0 && <strong className="invalid-label">预测已失效：{invalidationReasons.join("；")}</strong>}</article> : <p className="forecast-empty">没有预测：至少需要跨越 5 天的 6 个有效观测点，并完成滚动回测。</p>}</section>;
    })}<section className="raw-trend-data"><h2>原始快照与数据缺口</h2><div className="table-scroll"><table><thead><tr><th>观测时间</th><th>窗口</th>{Object.values(definitions).map((definition) => <th key={definition.label}>{definition.label}</th>)}<th>维度</th><th>缺口</th><th>来源</th></tr></thead><tbody>{[...snapshots].reverse().map((snapshot) => <tr key={snapshot.id}><td>{snapshot.observedAt.toLocaleString("zh-CN", { hour12: false })}</td><td>{snapshot.windowDays} 天</td>{Object.keys(definitions).map((key) => <td key={key}>{formatTrendValue((snapshot.metrics as MetricMap)[key], definitions[key].unit)}</td>)}<td><code>{JSON.stringify(snapshot.dimensions as DimensionMap || {})}</code></td><td>{snapshot.dataGaps.length ? snapshot.dataGaps.join("；") : "无已知缺口"}</td><td><a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">原始来源</a></td></tr>)}</tbody></table></div></section></>}
  </main>;
}
