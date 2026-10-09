import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { runTask, assertTaskLease, replayTarget, requireReplaySelection } from "../lib/pipeline-tasks.mjs";
import { linearTrendForecast, selectComparableSnapshots, TREND_METRICS } from "../lib/trend-policy.mjs";
import { finishJob } from "./job-policy.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const replay = await replayTarget(prisma, "trend-forecast");
const subjects = await prisma.trendSubject.findMany({ where: { enabled: true }, include: { snapshots: { orderBy: { observedAt: "desc" }, take: 365 } } });
let generated = 0, insufficient = 0, failed = 0;
let selected = 0;
for (const subject of subjects) {
  for (const metricKey of Object.keys(TREND_METRICS[subject.category])) {
    try {
      const resourceId = `${subject.id}:${metricKey}`;
      if (replay && replay.resourceId !== resourceId) continue;
      const revision = createHash("sha256").update(JSON.stringify(subject.snapshots.map((item) => [item.id, item.observedAt, item.metrics, item.windowDays, item.methodologyVersion]))).digest("hex");
      if (replay && replay.revision !== revision) continue;
      selected++;
      await runTask(prisma, { name: "trend-forecast", resourceId, revision }, async () => {
      const points = selectComparableSnapshots(subject.snapshots).flatMap((snapshot) => {
        const value = Number(snapshot.metrics?.[metricKey]);
        return Number.isFinite(value) ? [{ at: snapshot.observedAt, value }] : [];
      });
      const forecast = linearTrendForecast(points, 30);
      if (!forecast) { insufficient++; return false; }
      await prisma.$transaction(async (tx) => {
      await assertTaskLease(tx);
      await tx.trendForecast.upsert({
        where: { subjectId_metricKey_horizonDays_trainingWindowEnd: { subjectId: subject.id, metricKey, horizonDays: 30, trainingWindowEnd: forecast.trainingWindowEnd } },
        update: { ...forecast, generatedAt: new Date() },
        create: { subjectId: subject.id, metricKey, horizonDays: 30, ...forecast },
      });
      });
      generated++;
      return true;
      });
    } catch (error) { failed++; console.error(`${subject.slug}/${metricKey}: ${error.message}`); }
  }
}
requireReplaySelection(replay, selected ? [true] : []);
await finishJob({ prisma, name: "trend-forecast", summary: { subjects: subjects.length, generated, insufficient, failed }, startedAt, attempts: subjects.length, output: subjects.length ? generated + insufficient : 0 });
await prisma.$disconnect();
