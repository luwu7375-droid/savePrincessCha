// openai_archive.ts — MOCK FILE
//
// Real content has been moved to the openai_archive_entries DB table.
// This file is intentionally empty and safe to commit.
//
// Table schema (see migration 20260607000000):
//   entry_id       text (e.g. "E1_reporter_1920s", "POLICY")
//   triggers       text[]
//   content        text
//   can_easter_egg boolean
//   caution        text (nullable)
//   enabled        boolean
//
// To seed the DB, insert one row per ArchiveEntry, plus one row with
// entry_id = 'POLICY' containing the recall policy text.
//
// This file is no longer imported by index.ts.
// It is kept as a reference placeholder only.

export type ArchiveEntry = {
  id: string;
  triggers: string[];
  content: string;
  can_easter_egg: boolean;
  caution?: string;
};

// moved to DB: openai_archive_entries table
export const ARCHIVE_ROLEPLAY: ArchiveEntry[] = [];
export const ARCHIVE_POLICY = ""; // stored as entry_id = 'POLICY' row
