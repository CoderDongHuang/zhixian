ALTER TABLE "UserPreference" RENAME COLUMN "skillDirection" TO "skillDirections";
ALTER TABLE "UserPreference" ALTER COLUMN "skillDirections" TYPE TEXT[] USING CASE WHEN "skillDirections" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["skillDirections"] END;
ALTER TABLE "UserPreference" ALTER COLUMN "skillDirections" SET NOT NULL;
ALTER TABLE "UserPreference" ALTER COLUMN "skillDirections" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserPreference" RENAME COLUMN "learningGoal" TO "learningGoals";
ALTER TABLE "UserPreference" ALTER COLUMN "learningGoals" TYPE TEXT[] USING CASE WHEN "learningGoals" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["learningGoals"] END;
ALTER TABLE "UserPreference" ALTER COLUMN "learningGoals" SET NOT NULL;
ALTER TABLE "UserPreference" ALTER COLUMN "learningGoals" SET DEFAULT ARRAY[]::TEXT[];
