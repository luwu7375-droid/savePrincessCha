-- Add anchor column to xiaocha_diary_entries
-- Stores the concrete "anchor" (specific event/quote/action/object) that grounds each diary entry.
-- Required by the updated diary generation prompt (v2: 先有物再有情).

ALTER TABLE xiaocha_diary_entries
ADD COLUMN anchor text DEFAULT '';

COMMENT ON COLUMN xiaocha_diary_entries.anchor IS 'The concrete anchor grounding this entry: a specific quote, action, object, or scene. Empty for ordinary_day entries.';
