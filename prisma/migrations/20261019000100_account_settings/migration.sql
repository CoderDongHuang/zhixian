CREATE TABLE "AccountProfile" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "passwordHash" TEXT,
  "avatar" BYTEA,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "AccountVerification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountVerification_userId_purpose_key" ON "AccountVerification"("userId", "purpose");
CREATE INDEX "AccountVerification_expiresAt_idx" ON "AccountVerification"("expiresAt");
