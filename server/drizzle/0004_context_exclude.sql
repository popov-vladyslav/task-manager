-- Revision A / B5: a context can be excluded from the "All" task view and the
-- Calendar. Its tasks stay reachable by selecting the context's own chip.
ALTER TABLE contexts
  ADD COLUMN exclude_from_all boolean NOT NULL DEFAULT false;
