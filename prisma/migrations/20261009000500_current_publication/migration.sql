ALTER TABLE "Event" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Event_isPublic_createdAt_idx" ON "Event"("isPublic", "createdAt");

-- Publication is a projection of the latest analysis, never an independent flag.
CREATE FUNCTION refresh_event_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE((SELECT a.status = 'AUTO_PUBLISHED' AND a."inputRevision" = NEW."materialRevision"
    FROM "Analysis" a WHERE a."eventId" = NEW.id ORDER BY a."analyzedAt" DESC, a.id DESC LIMIT 1), false)
    INTO NEW."isPublic";
  RETURN NEW;
END;
$$;
CREATE TRIGGER event_publication BEFORE INSERT OR UPDATE ON "Event"
FOR EACH ROW EXECUTE FUNCTION refresh_event_publication();

CREATE FUNCTION refresh_analysis_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    UPDATE "Event" SET "isPublic" = "isPublic" WHERE id = OLD."eventId";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    UPDATE "Event" SET "isPublic" = "isPublic" WHERE id = NEW."eventId";
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER analysis_publication AFTER INSERT OR DELETE OR UPDATE OF "eventId", status, "inputRevision", "analyzedAt" ON "Analysis"
FOR EACH ROW EXECUTE FUNCTION refresh_analysis_publication();
UPDATE "Event" SET "isPublic" = "isPublic";
