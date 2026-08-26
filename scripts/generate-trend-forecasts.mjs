import { PrismaClient } from "@prisma/client";
import { linearTrendForecast, selectComparableSnapshots, TREND_METRICS } from "../lib/trend-policy.mjs";
import { finishJob } from "./job-policy.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const subjects = await prisma.trendSubject.findMany({ where: { enabled: true }, include: { snapshots: { orderBy: { observedAt: "desc" }, take: 365 } } });
let generated = 0, insufficient = 0, failed = 0;
for (const subject of subjects) {
  for (const metricKey of Object.keys(TREND_METRICS[subject.category])) {
    try {
      const points = selectComparableSnapshots(subject.snapshots).flatMap((snapshot) => {
        const value = Number(snapshot.metrics?.[metricKey]);
        return Number.isFinite(value) ? [{ at: snapshot.observedAt, value }] : [];
      });
      const forecast = linearTrendForecast(points, 30);
      if (!forecast) { insufficient++; continue; }
      await prisma.trendForecast.upsert({
        where: { subjectId_metricKey_horizonDays_trainingWindowEnd: { subjectId: subject.id, metricKey, horizonDays: 30, trainingWindowEnd: forecast.trainingWindowEnd } },
        update: { ...forecast, generatedAt: new Date() },
        create: { subjectId: subject.id, metricKey, horizonDays: 30, ...forecast },
      });
      generated++;
    } catch (error) { failed++; console.error(`${subject.slug}/${metricKey}: ${error.message}`); }
  }
}
await finishJob({ prisma, name: "trend-forecast", summary: { subjects: subjects.length, generated, insufficient, failed }, startedAt, attempts: subjects.length, output: subjects.length ? generated + insufficient : 0 });
await prisma.$disconnect();
