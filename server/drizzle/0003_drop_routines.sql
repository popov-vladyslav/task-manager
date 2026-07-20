-- Revision A: the Routines feature was removed entirely. The daily-routine use
-- case is now served by a context excluded from the "All" view (see 0004).
-- Drop the child (routine_completions) before the parent (routines).
DROP TABLE IF EXISTS routine_completions;
DROP TABLE IF EXISTS routines;
