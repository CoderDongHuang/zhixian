CREATE INDEX IF NOT EXISTS "Digest_createdAt_idx" ON "Digest"("createdAt");
CREATE INDEX IF NOT EXISTS "Event_topic_idx" ON "Event"("topic");
CREATE INDEX IF NOT EXISTS "Analysis_eventId_status_analyzedAt_idx" ON "Analysis"("eventId", "status", "analyzedAt");
CREATE INDEX IF NOT EXISTS "FeedItem_publishedAt_idx" ON "FeedItem"("publishedAt");
CREATE INDEX IF NOT EXISTS "ReadHistory_userId_readAt_idx" ON "ReadHistory"("userId", "readAt");
CREATE INDEX IF NOT EXISTS "Entity_updatedAt_idx" ON "Entity"("updatedAt");
CREATE INDEX IF NOT EXISTS "EventTimeline_occurredAt_idx" ON "EventTimeline"("occurredAt");
