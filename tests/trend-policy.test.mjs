import assert from "node:assert/strict";
import test from "node:test";
import { forecastInvalidationReasons, linearTrendForecast, normalizeDataGaps, normalizeFeedObservations, normalizeTrendMetrics, parseTrendWindow, requireHttpsUrl, selectComparableSnapshots, trendChange } from "../lib/trend-policy.mjs";

test("trend metrics are category allowlisted and gaps are bounded", () => {
  assert.deepEqual(normalizeTrendMetrics("JOB", { jobCount: 12, medianSalary: 30000, stars: 99, remoteShare: -1 }), { jobCount: 12, medianSalary: 30000 });
  assert.deepEqual(normalizeDataGaps(["  缺少薪资 ", "缺少薪资", ""]), ["缺少薪资"]);
  assert.equal(parseTrendWindow("365"), 30);
});

test("trend feeds require safe HTTPS URLs and bounded observation batches", () => {
  assert.equal(requireHttpsUrl("https://example.com/feed", "endpoint"), "https://example.com/feed");
  assert.throws(() => requireHttpsUrl("http://example.com/feed", "endpoint"), /HTTPS/);
  assert.throws(() => requireHttpsUrl("https://token@example.com/feed", "endpoint"), /credentials/);
  assert.deepEqual(normalizeFeedObservations({ observations: [{ metrics: { jobCount: 1 } }] }), [{ metrics: { jobCount: 1 } }]);
  assert.throws(() => normalizeFeedObservations([]), /1 to 100/);
});

test("trend comparisons only use the latest observation-window methodology", () => {
  const snapshots = [
    { observedAt: "2026-08-03T00:00:00Z", windowDays: 30, value: 3 },
    { observedAt: "2026-08-01T00:00:00Z", windowDays: 7, value: 1 },
    { observedAt: "2026-08-02T00:00:00Z", windowDays: 30, value: 2 },
  ];
  assert.deepEqual(selectComparableSnapshots(snapshots).map((item) => item.value), [2, 3]);
});

test("linear forecast requires enough history and exposes backtest and interval", () => {
  const origin = Date.UTC(2026, 7, 1);
  const short = [1, 2, 3, 4, 5].map((value, index) => ({ at: new Date(origin + index * 86400000), value }));
  assert.equal(linearTrendForecast(short), null);
  const result = linearTrendForecast([10, 12, 14, 16, 18, 20, 22, 24].map((value, index) => ({ at: new Date(origin + index * 86400000), value })));
  assert.ok(result);
  assert.equal(result.sampleSize, 8);
  assert.ok(result.lowerBound <= result.forecastValue && result.forecastValue <= result.upperBound);
  assert.ok(result.backtestMae < 0.000001);
  assert.match(result.invalidationRule, /失效/);
});

test("trend change distinguishes absolute and percentage movement", () => {
  assert.deepEqual(trendChange([{ value: 100 }, { value: 125 }]), { absolute: 25, percent: 25 });
  assert.deepEqual(trendChange([{ value: 0 }, { value: 5 }]), { absolute: 5, percent: null });
});

test("forecast invalidation detects newer observations, interval breaches, staleness, and expiry", () => {
  const forecast = { trainingWindowEnd: "2026-08-01T00:00:00Z", targetAt: "2026-08-31T00:00:00Z", lowerBound: 80, upperBound: 120 };
  assert.deepEqual(forecastInvalidationReasons(forecast, { at: "2026-08-02T00:00:00Z", value: 100 }, "2026-08-02T00:00:00Z"), ["训练窗口后已有新快照，需要重新生成预测"]);
  assert.deepEqual(forecastInvalidationReasons(forecast, { at: "2026-08-02T00:00:00Z", value: 130 }, "2026-09-01T00:00:00Z"), [
    "训练窗口后已有新快照，需要重新生成预测",
    "连续 7 天缺少新数据",
    "预测目标日期已过",
    "训练窗口后的新快照超出预测区间",
  ]);
});
