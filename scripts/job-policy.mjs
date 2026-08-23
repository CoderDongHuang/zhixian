export function evaluateJob(summary, options = {}) {
  const attempts = Math.max(0, Number(options.attempts ?? summary.total ?? summary.input ?? 0));
  const failures = Math.max(0, Number(summary.failed ?? summary.failures ?? 0));
  const output = Math.max(0, Number(options.output ?? summary.output ?? 0));
  const threshold = Number(options.failureRateThreshold ?? process.env.JOB_FAILURE_RATE_THRESHOLD ?? 0.2);
  const failureRate = attempts > 0 ? failures / attempts : 0;
  const allFailed = attempts > 0 && failures >= attempts;
  const zeroInput = Boolean(options.failOnEmptyInput && attempts === 0);
  const zeroOutput = Boolean(options.failOnZeroOutput && attempts > 0 && output === 0);
  const failed = allFailed || failureRate > threshold || zeroInput || zeroOutput;
  const warning = !failed && (failures > 0 || attempts === 0 || output === 0);
  return { status: failed ? "FAILED" : warning ? "WARNING" : "SUCCEEDED", attempts, failures, output, failureRate, threshold, allFailed, zeroInput, zeroOutput };
}

export async function finishJob({ prisma, name, summary, startedAt, ...options }) {
  const result = evaluateJob(summary, options);
  const payload = { type: "pipeline-run-summary", name, ...summary, ...result, finishedAt: new Date().toISOString() };
  console.log(JSON.stringify(payload));
  await prisma.pipelineRun.create({
    data: {
      name,
      status: result.status,
      inputCount: result.attempts,
      outputCount: result.output,
      failureCount: result.failures,
      summary: payload,
      startedAt,
    },
  }).catch((error) => {
    console.error(`${name}: failed to persist pipeline run: ${error.message}`);
    process.exitCode = 1;
  });
  if (result.status === "FAILED") process.exitCode = 1;
  return result;
}
