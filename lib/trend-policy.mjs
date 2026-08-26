export const TREND_CATEGORIES = ["GITHUB", "MODEL_PRODUCT", "PAPER", "JOB"];
export const TREND_WINDOWS = [7, 30, 90];

export const TREND_METRICS = {
  GITHUB: {
    stars: { label: "Stars", unit: "个", method: "GitHub 仓库当前 stargazers_count" },
    forks: { label: "Forks", unit: "个", method: "GitHub 仓库当前 forks_count" },
    contributors: { label: "贡献者", unit: "人", method: "GitHub Contributors API 分页总数" },
    releases30d: { label: "30 天发布", unit: "次", method: "最近 30 天 GitHub Release 数" },
    issueVelocity30d: { label: "30 天 Issue 变化", unit: "条", method: "最近 30 天创建的非 PR Issue 数" },
  },
  MODEL_PRODUCT: {
    releases30d: { label: "30 天发布", unit: "次", method: "授权源记录的 30 天版本/产品发布数" },
    inputPricePerMillion: { label: "输入价格", unit: "美元/百万 Token", method: "官方 API 价格表标准化值" },
    outputPricePerMillion: { label: "输出价格", unit: "美元/百万 Token", method: "官方 API 价格表标准化值" },
    contextTokens: { label: "上下文长度", unit: "Token", method: "官方模型规格中的最大上下文" },
    benchmarkScore: { label: "基准分数", unit: "分", method: "授权源指定基准的原始分数" },
  },
  PAPER: {
    paperCount: { label: "主题论文量", unit: "篇", method: "窗口内来源返回的主题论文总数" },
    citations: { label: "引用量", unit: "次", method: "来源返回论文的引用数汇总" },
    citationGrowth: { label: "引用增长", unit: "次", method: "相邻快照引用量差值" },
    institutions: { label: "活跃机构", unit: "家", method: "论文作者单位去重数" },
  },
  JOB: {
    jobCount: { label: "岗位数", unit: "个", method: "授权招聘数据源窗口内去重岗位数" },
    medianSalary: { label: "薪资中位数", unit: "元/月", method: "有薪资岗位的月薪中位数" },
    remoteShare: { label: "远程占比", unit: "%", method: "远程岗位数除以有效岗位数" },
    skillCoverage: { label: "技能覆盖", unit: "项", method: "岗位技能关键词去重数" },
  },
};

export const PRIMARY_TREND_METRIC = {
  GITHUB: "stars",
  MODEL_PRODUCT: "contextTokens",
  PAPER: "paperCount",
  JOB: "jobCount",
};

export function isTrendCategory(value) {
  return TREND_CATEGORIES.includes(value);
}

export function parseTrendWindow(value) {
  const parsed = Number(value);
  return TREND_WINDOWS.includes(parsed) ? parsed : 30;
}

export function normalizeTrendMetrics(category, input) {
  if (!isTrendCategory(category) || !input || typeof input !== "object" || Array.isArray(input)) return {};
  const allowed = TREND_METRICS[category];
  const output = {};
  for (const key of Object.keys(allowed)) {
    const value = Number(input[key]);
    if (Number.isFinite(value) && value >= 0) output[key] = value;
  }
  return output;
}

export function normalizeDataGaps(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim().slice(0, 200)).filter(Boolean))].slice(0, 20);
}

export function requireHttpsUrl(value, label = "URL") {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe URL");
    return url.href;
  } catch {
    throw new Error(`${label} must be an HTTPS URL without embedded credentials`);
  }
}

export function normalizeFeedObservations(value) {
  const observations = Array.isArray(value) ? value : Array.isArray(value?.observations) ? value.observations : [value];
  if (!observations.length || observations.length > 100 || observations.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new Error("Trend feed must return one observation or an array of 1 to 100 observations");
  }
  return observations;
}

export function selectComparableSnapshots(rawSnapshots) {
  if (!Array.isArray(rawSnapshots)) return [];
  const snapshots = rawSnapshots
    .filter((item) => item && TREND_WINDOWS.includes(Number(item.windowDays)) && !Number.isNaN(new Date(item.observedAt).getTime()))
    .sort((left, right) => new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime());
  const latestWindow = snapshots.at(-1)?.windowDays;
  return latestWindow === undefined ? [] : snapshots.filter((item) => Number(item.windowDays) === Number(latestWindow));
}

export function trendChange(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const first = Number(points[0]?.value);
  const last = Number(points.at(-1)?.value);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  const absolute = last - first;
  return { absolute, percent: first === 0 ? null : absolute / Math.abs(first) * 100 };
}

export function forecastInvalidationReasons(forecast, latestPoint, now = new Date()) {
  if (!forecast || !latestPoint) return [];
  const trainingWindowEnd = new Date(forecast.trainingWindowEnd);
  const targetAt = new Date(forecast.targetAt);
  const latestAt = new Date(latestPoint.at);
  const currentAt = now instanceof Date ? now : new Date(now);
  if ([trainingWindowEnd, targetAt, latestAt, currentAt].some((value) => Number.isNaN(value.getTime()))) return ["预测时间信息无效"];
  const reasons = [];
  if (latestAt.getTime() > trainingWindowEnd.getTime()) reasons.push("训练窗口后已有新快照，需要重新生成预测");
  if (currentAt.getTime() - latestAt.getTime() > 7 * 86400000) reasons.push("连续 7 天缺少新数据");
  if (currentAt.getTime() > targetAt.getTime()) reasons.push("预测目标日期已过");
  const value = Number(latestPoint.value);
  if (latestAt.getTime() > trainingWindowEnd.getTime() && Number.isFinite(value) && (value < Number(forecast.lowerBound) || value > Number(forecast.upperBound))) {
    reasons.push("训练窗口后的新快照超出预测区间");
  }
  return reasons;
}

function regression(points) {
  const origin = points[0].at.getTime();
  const values = points.map((point) => ({ x: (point.at.getTime() - origin) / 86400000, y: point.value }));
  const meanX = values.reduce((sum, point) => sum + point.x, 0) / values.length;
  const meanY = values.reduce((sum, point) => sum + point.y, 0) / values.length;
  const denominator = values.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  if (denominator === 0) return null;
  const slope = values.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
  const intercept = meanY - slope * meanX;
  return { origin, slope, intercept, predict: (at) => intercept + slope * ((at.getTime() - origin) / 86400000) };
}

export function linearTrendForecast(rawPoints, horizonDays = 30) {
  const points = rawPoints
    .map((point) => ({ at: point.at instanceof Date ? point.at : new Date(point.at), value: Number(point.value) }))
    .filter((point) => !Number.isNaN(point.at.getTime()) && Number.isFinite(point.value) && point.value >= 0)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (points.length < 6 || points.at(-1).at.getTime() - points[0].at.getTime() < 5 * 86400000) return null;
  const model = regression(points);
  if (!model) return null;
  const errors = [];
  const percentageErrors = [];
  for (let index = 3; index < points.length; index++) {
    const partial = regression(points.slice(0, index));
    if (!partial) continue;
    const predicted = Math.max(0, partial.predict(points[index].at));
    const error = Math.abs(predicted - points[index].value);
    errors.push(error);
    if (points[index].value > 0) percentageErrors.push(error / points[index].value * 100);
  }
  if (!errors.length) return null;
  const lastAt = points.at(-1).at;
  const targetAt = new Date(lastAt.getTime() + horizonDays * 86400000);
  const forecastValue = Math.max(0, model.predict(targetAt));
  const residuals = points.map((point) => point.value - model.predict(point.at));
  const residualDeviation = Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length);
  const backtestMae = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const interval = 1.282 * Math.max(residualDeviation, backtestMae) * Math.sqrt(1 + horizonDays / Math.max(1, (lastAt.getTime() - points[0].at.getTime()) / 86400000));
  return {
    targetAt,
    forecastValue,
    lowerBound: Math.max(0, forecastValue - interval),
    upperBound: forecastValue + interval,
    confidenceLevel: 0.8,
    method: "最小二乘线性趋势 + 扩展窗口滚动回测",
    backtestMae,
    backtestMape: percentageErrors.length ? percentageErrors.reduce((sum, value) => sum + value, 0) / percentageErrors.length : null,
    sampleSize: points.length,
    trainingWindowStart: points[0].at,
    trainingWindowEnd: lastAt,
    invalidationRule: "新快照超出预测区间，来源口径变化，或连续 7 天缺少数据时失效",
  };
}

export function formatTrendValue(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "数据缺失";
  const formatted = Math.abs(number) >= 10000 ? new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(number) : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(number);
  return `${formatted}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
}
