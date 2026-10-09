CREATE TABLE "WebPushIntent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "endpoint" TEXT NOT NULL,
  "changedAt" BIGINT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "WebPushIntent_userId_endpoint_key" ON "WebPushIntent"("userId", "endpoint");
