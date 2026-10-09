ALTER TABLE "RawDocument" ADD COLUMN "materialRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Event" ADD COLUMN "materialRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Analysis" ADD COLUMN "inputRevision" INTEGER, ADD COLUMN "inputManifest" JSONB;
UPDATE "Analysis" SET "inputRevision" = 0;

-- Material writers and analysis publishers serialize on the event row.
CREATE FUNCTION invalidate_event_material(target TEXT) RETURNS VOID AS $$
BEGIN
  UPDATE "Event" SET "materialRevision" = "materialRevision" + 1 WHERE id = target;
  UPDATE "Analysis" SET status = 'STALE' WHERE "eventId" = target AND status <> 'STALE';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION invalidate_document_material() RETURNS TRIGGER AS $$
DECLARE target TEXT;
BEGIN
  IF ROW(NEW.title, NEW.content, NEW."contentHash", NEW."sourceId", NEW."cleanedContent", NEW."translatedContent", NEW.language, NEW."publishedAt")
     IS DISTINCT FROM ROW(OLD.title, OLD.content, OLD."contentHash", OLD."sourceId", OLD."cleanedContent", OLD."translatedContent", OLD.language, OLD."publishedAt")
     OR (OLD."processingStatus" = 'PROCESSED' AND NEW."processingStatus" <> 'PROCESSED') THEN
    NEW."materialRevision" := OLD."materialRevision" + 1;
    DELETE FROM "Embedding" WHERE "documentId" = OLD.id;
    FOR target IN SELECT "eventId" FROM "EventDocument" WHERE "documentId" = OLD.id ORDER BY "eventId" LOOP
      PERFORM invalidate_event_material(target);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER document_material_changed BEFORE UPDATE ON "RawDocument"
FOR EACH ROW EXECUTE FUNCTION invalidate_document_material();

CREATE FUNCTION invalidate_event_membership() RETURNS TRIGGER AS $$
DECLARE target TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."eventId" = OLD."eventId" AND NEW."documentId" = OLD."documentId" THEN RETURN NEW; END IF;
  FOR target IN SELECT DISTINCT value FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD."eventId" END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW."eventId" END
  ]) value WHERE value IS NOT NULL ORDER BY value LOOP
    PERFORM invalidate_event_material(target);
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER event_membership_changed AFTER INSERT OR UPDATE OR DELETE ON "EventDocument"
FOR EACH ROW EXECUTE FUNCTION invalidate_event_membership();

CREATE FUNCTION fence_analysis_material() RETURNS TRIGGER AS $$
DECLARE revision INTEGER;
BEGIN
  SELECT "materialRevision" INTO revision FROM "Event" WHERE id = NEW."eventId" FOR UPDATE;
  IF TG_OP = 'INSERT' THEN NEW."inputRevision" := COALESCE(NEW."inputRevision", revision); END IF;
  IF NEW."inputRevision" IS DISTINCT FROM revision OR (TG_OP = 'UPDATE' AND OLD.status = 'STALE') THEN
    NEW.status := 'STALE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER analysis_material_fence BEFORE INSERT OR UPDATE ON "Analysis"
FOR EACH ROW EXECUTE FUNCTION fence_analysis_material();
