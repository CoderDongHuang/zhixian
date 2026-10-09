ALTER TABLE "PipelineAttempt" DROP CONSTRAINT "PipelineAttempt_taskId_fkey";
ALTER TABLE "PipelineAttempt" ADD CONSTRAINT "PipelineAttempt_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "PipelineTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiCall" DROP CONSTRAINT "AiCall_attemptId_fkey";
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "PipelineAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
