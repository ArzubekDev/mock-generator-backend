-- Run once against the Levin API database (synchronize is off).
ALTER TABLE project
  ADD COLUMN IF NOT EXISTS "defaultLimit" integer NOT NULL DEFAULT 20;
