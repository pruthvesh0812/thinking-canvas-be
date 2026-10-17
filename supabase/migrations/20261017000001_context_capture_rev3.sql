-- Migration: context capture — align to the frontend's schema.md rev 3 (2026-10-17)
--
-- Reconciles 20261016000002_context_capture.sql with thinking-canvas-frontend
-- .ai/features/text-context-capture/schema.md (rev 3) plus the product decisions
-- taken on top of it. Written as a NEW migration (not an edit of ...0002) so it is
-- safe whether or not ...0002 was ever applied somewhere; it also migrates any
-- rows ...0002 already created.
--
-- Decisions baked in:
--   * Deleting a note = set context_entries.deleted_at. Links are NOT flipped
--     (readers filter on both), so delete/undo needs no RPC.
--   * Link origin is OWNED | MOVED (the old 'shortcut' value is gone).
--   * Note length: hard DB ceiling of 3000 chars; the real, changeable limit is
--     system_config 'context.note_max_chars' (default 1000), enforced by trigger.
--   * context_attachments table now; NO storage bucket and NO virus scan yet.
--   * system_config now.
--   * NOT here (deliberately): agent_context view, edges.clarification_* and any
--     SSE / notify event for context — the "?" will be decided by an LLM call
--     later, and live updates are out for v1.
--
-- Client write rules (RLS): entries, links and attachments can be selected,
-- inserted and updated by the canvas owner but NEVER hard-deleted from the client.

-- ─────────────────────────────────────────────
-- Shared helper
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────
-- system_config — global tunables (the spec's bracketed numbers)
-- Readable by any signed-in user; writable only by the service role (no write
-- policy exists, so RLS denies everyone else). Change values from the Supabase
-- dashboard / SQL — no release needed.
-- ─────────────────────────────────────────────
CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_system_config_touch
  BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_config: authenticated read"
  ON system_config FOR SELECT TO authenticated
  USING (true);

INSERT INTO system_config (key, value, description) VALUES
  ('context.composer_max_lines',        '5',     'Lines the note composer grows to before it scrolls'),
  ('context.canvas_bar_max_lines',      '5',     'Lines the canvas context bar grows to before it scrolls'),
  ('context.hash_autocomplete_rows',    '5',     'Rows shown by the #text node autocomplete'),
  ('context.note_max_chars',            '1000',  'Max characters in a note; enforced by a trigger on context_entries (hard ceiling 3000)'),
  ('context.panel_note_collapsed_lines','4',     'Lines of a note shown before "Show more"'),
  ('context.removal_prompt_visible_ms', '10000', 'How long the "Why remove this?" prompt stays visible'),
  -- Both edge.* keys belong to the "?" feature, whose rule is being redesigned
  -- (LLM-decided); they are seeded only so the frontend has values meanwhile.
  ('edge.clarification_delay_ms',       '10000', 'Wait before an unlabelled edge may show a "?" (may be replaced by the LLM-driven design)'),
  ('edge.needs_you_max_visible',        '3',     'Max "Needs you" items visible at once');

-- ─────────────────────────────────────────────
-- context_entries
-- ─────────────────────────────────────────────
-- content becomes nullable: an attachment may have no caption.
ALTER TABLE context_entries ALTER COLUMN content DROP NOT NULL;

ALTER TABLE context_entries
  DROP CONSTRAINT context_entries_content_len_chk,
  DROP CONSTRAINT context_entries_content_nonempty_chk;

ALTER TABLE context_entries
  -- Hard backstop. The changeable product limit is system_config
  -- 'context.note_max_chars', enforced by the trigger below.
  ADD CONSTRAINT context_entries_content_len_chk
    CHECK (content IS NULL OR char_length(content) <= 3000),
  -- Saving an empty note creates nothing; only an attachment may omit text.
  ADD CONSTRAINT context_entries_content_required_chk
    CHECK (source = 'attachment' OR (content IS NOT NULL AND btrim(content) <> ''));

-- Lets child tables reference (id, canvas_id) so a link/attachment can never
-- disagree with its entry about which canvas it belongs to.
ALTER TABLE context_entries
  ADD CONSTRAINT context_entries_id_canvas_key UNIQUE (id, canvas_id);

-- Enforce the configurable length on insert and on every edit of the text.
-- SECURITY DEFINER so it can read system_config regardless of the caller's grants.
-- A missing or non-numeric config value falls back to the 3000 ceiling.
CREATE OR REPLACE FUNCTION context_entries_check_length()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_chars INT;
BEGIN
  IF NEW.content IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (value #>> '{}')::INT INTO max_chars
    FROM system_config
   WHERE key = 'context.note_max_chars' AND jsonb_typeof(value) = 'number';

  IF max_chars IS NOT NULL AND char_length(NEW.content) > max_chars THEN
    RAISE EXCEPTION 'note is longer than % characters', max_chars
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_context_entries_check_length
  BEFORE INSERT OR UPDATE OF content ON context_entries
  FOR EACH ROW EXECUTE FUNCTION context_entries_check_length();

-- ─────────────────────────────────────────────
-- context_links
-- ─────────────────────────────────────────────
ALTER TABLE context_links RENAME COLUMN target_kind TO target_type;
ALTER TABLE context_links RENAME CONSTRAINT context_links_target_kind_chk TO context_links_target_type_chk;

-- origin (user_chosen | user_moved | shortcut) -> origin_status (OWNED | MOVED)
ALTER TABLE context_links DROP CONSTRAINT context_links_origin_chk;
ALTER TABLE context_links RENAME COLUMN origin TO origin_status;
UPDATE context_links
   SET origin_status = CASE origin_status WHEN 'user_moved' THEN 'MOVED' ELSE 'OWNED' END;
ALTER TABLE context_links
  ADD CONSTRAINT context_links_origin_status_chk CHECK (origin_status IN ('OWNED', 'MOVED'));

-- canvas_id: lets RLS and per-canvas reads skip the join through entries. The
-- composite FK below guarantees it always equals the entry's canvas_id.
ALTER TABLE context_links ADD COLUMN canvas_id UUID;
UPDATE context_links l SET canvas_id = e.canvas_id FROM context_entries e WHERE e.id = l.entry_id;
ALTER TABLE context_links ALTER COLUMN canvas_id SET NOT NULL;

ALTER TABLE context_links DROP CONSTRAINT context_links_entry_id_fkey;
ALTER TABLE context_links
  ADD CONSTRAINT context_links_entry_canvas_fkey
    FOREIGN KEY (entry_id, canvas_id) REFERENCES context_entries (id, canvas_id) ON DELETE CASCADE;

-- updated_at bumps on a move (target_id / origin_status) and on any state change.
ALTER TABLE context_links ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE TRIGGER trg_context_links_touch
  BEFORE UPDATE ON context_links
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- One ACTIVE link per entry per target. A canvas link has NULL target_id, so
-- fold in canvas_id to keep it unique too.
DROP INDEX uq_context_links_active_target;
CREATE UNIQUE INDEX uq_context_links_active_target
  ON context_links (entry_id, target_type, COALESCE(target_id, canvas_id))
  WHERE state = 'active';

-- Same behaviour as before on node/edge delete; column renamed (updated_at is
-- bumped by the touch trigger above).
CREATE OR REPLACE FUNCTION retire_context_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE context_links
     SET state = 'deleted'
   WHERE target_type = TG_ARGV[0]
     AND target_id = OLD.id
     AND state = 'active';
  RETURN OLD;
END;
$$;

-- ─────────────────────────────────────────────
-- component_removals (was component_removal_reasons)
-- ─────────────────────────────────────────────
ALTER TABLE component_removal_reasons RENAME TO component_removals;
ALTER TABLE component_removals RENAME COLUMN target_kind TO component_type;
ALTER TABLE component_removals RENAME COLUMN target_id   TO component_id;
ALTER TABLE component_removals RENAME CONSTRAINT component_removal_reasons_pkey          TO component_removals_pkey;
ALTER TABLE component_removals RENAME CONSTRAINT component_removal_reasons_canvas_id_fkey TO component_removals_canvas_id_fkey;
ALTER TABLE component_removals RENAME CONSTRAINT component_removal_reasons_session_id_fkey TO component_removals_session_id_fkey;
ALTER TABLE component_removals RENAME CONSTRAINT component_removal_reasons_kind_chk       TO component_removals_type_chk;
ALTER TABLE component_removals RENAME CONSTRAINT component_removal_reasons_reason_chk     TO component_removals_reason_chk;
ALTER INDEX idx_component_removal_reasons_canvas_id RENAME TO idx_component_removals_canvas_id;

-- A snapshot of what was removed ("n4 · Pricing") so the record stays readable
-- after the component is gone.
ALTER TABLE component_removals ADD COLUMN component_label TEXT;
UPDATE component_removals SET component_label = '' WHERE component_label IS NULL;
ALTER TABLE component_removals
  ALTER COLUMN component_label SET NOT NULL,
  ADD CONSTRAINT component_removals_label_len_chk CHECK (char_length(component_label) <= 500),
  ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();

-- ─────────────────────────────────────────────
-- context_attachments — the file behind an 'attachment' entry (v1: one per entry)
-- Table only for now: no storage bucket and no safety scan exist yet, so every
-- row stays scan_status = 'pending' and nothing may read the file.
-- ─────────────────────────────────────────────
CREATE TABLE context_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id     UUID NOT NULL,
  canvas_id    UUID NOT NULL,
  storage_path TEXT NOT NULL,     -- object path in a PRIVATE bucket (convention TBD); never a public URL
  file_name    TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  width        INT,               -- images only
  height       INT,
  scan_status  TEXT NOT NULL DEFAULT 'pending',   -- pending | clean | rejected
  alt_text     TEXT,              -- screen-reader description
  uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT context_attachments_size_chk CHECK (size_bytes >= 0),
  CONSTRAINT context_attachments_scan_status_chk CHECK (scan_status IN ('pending', 'clean', 'rejected')),
  -- v1: one file per entry. Drop this constraint to allow several later.
  CONSTRAINT context_attachments_one_per_entry UNIQUE (entry_id),
  CONSTRAINT context_attachments_entry_canvas_fkey
    FOREIGN KEY (entry_id, canvas_id) REFERENCES context_entries (id, canvas_id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- RLS — owner-scoped; select / insert / update only (no client hard delete)
-- ─────────────────────────────────────────────
ALTER TABLE context_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY "context_entries: owner access" ON context_entries;
CREATE POLICY "context_entries: owner select" ON context_entries FOR SELECT
  USING (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()));
CREATE POLICY "context_entries: owner insert" ON context_entries FOR INSERT
  WITH CHECK (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()));
CREATE POLICY "context_entries: owner update" ON context_entries FOR UPDATE
  USING (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()))
  WITH CHECK (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()));

DROP POLICY "context_links: owner access" ON context_links;
CREATE POLICY "context_links: owner select" ON context_links FOR SELECT
  USING (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()));
CREATE POLICY "context_links: owner insert" ON context_links FOR INSERT
  WITH CHECK (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()));
CREATE POLICY "context_links: owner update" ON context_links FOR UPDATE
  USING (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()))
  WITH CHECK (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()));

-- Attachments: no client UPDATE at all and inserts must start 'pending' — the
-- backend owns scan_status, a client must not be able to mark its own file clean.
CREATE POLICY "context_attachments: owner select" ON context_attachments FOR SELECT
  USING (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()));
CREATE POLICY "context_attachments: owner insert" ON context_attachments FOR INSERT
  WITH CHECK (
    scan_status = 'pending'
    AND canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid())
  );

-- "Why remove this?" answers: insert + select only.
DROP POLICY "component_removal_reasons: owner access" ON component_removals;
CREATE POLICY "component_removals: owner select" ON component_removals FOR SELECT
  USING (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()));
CREATE POLICY "component_removals: owner insert" ON component_removals FOR INSERT
  WITH CHECK (canvas_id IN (SELECT id FROM canvases WHERE user_id = auth.uid()));

-- ─────────────────────────────────────────────
-- edges.label — rev 3 caps it at 80 chars (was 200)
-- ─────────────────────────────────────────────
ALTER TABLE edges DROP CONSTRAINT edges_label_len_chk;
ALTER TABLE edges ADD CONSTRAINT edges_label_len_chk CHECK (label IS NULL OR char_length(label) <= 80);

-- ─────────────────────────────────────────────
-- create_context_entry — one atomic write: entry + its links (+ optional file row)
--
-- SECURITY INVOKER (the default): RLS applies exactly as for a direct insert.
-- Idempotent on the client-generated ids, so a retry after a dropped connection
-- completes the write instead of failing or duplicating. Every entry needs at
-- least one link (an entry without one is invisible to everyone).
--
--   p_entry      {id?, canvas_id, session_id?, source, content?}
--   p_links      [{id?, target_type, target_id?, origin_status?}, …]   (a JSON array)
--   p_attachment {id?, storage_path, file_name, mime_type, size_bytes, width?, height?, alt_text?}
--
-- Links are deliberately not checked against nodes/edges: the node a note is aimed
-- at may not have been saved yet, and a rejected note would lose the user's text.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_context_entry(
  p_entry      JSONB,
  p_links      JSONB,
  p_attachment JSONB DEFAULT NULL
)
RETURNS context_entries
LANGUAGE plpgsql
AS $$
DECLARE
  v_id     UUID := COALESCE(NULLIF(p_entry->>'id', '')::UUID, gen_random_uuid());
  v_canvas UUID := (p_entry->>'canvas_id')::UUID;
  v_source TEXT := p_entry->>'source';
  v_entry  context_entries;
  v_link   JSONB;
BEGIN
  IF v_canvas IS NULL THEN
    RAISE EXCEPTION 'canvas_id is required' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_links) IS DISTINCT FROM 'array' OR jsonb_array_length(p_links) = 0 THEN
    RAISE EXCEPTION 'an entry needs at least one link' USING ERRCODE = 'check_violation';
  END IF;
  IF p_attachment IS NOT NULL AND v_source IS DISTINCT FROM 'attachment' THEN
    RAISE EXCEPTION 'an attachment needs source = attachment' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO context_entries (id, canvas_id, session_id, source, content)
  VALUES (v_id, v_canvas, NULLIF(p_entry->>'session_id', '')::UUID, v_source, p_entry->>'content')
  ON CONFLICT (id) DO NOTHING;

  -- A retry finds its own row; an id that exists in someone else's canvas is
  -- invisible here and is refused rather than silently ignored.
  SELECT * INTO v_entry FROM context_entries WHERE id = v_id;
  IF NOT FOUND OR v_entry.canvas_id <> v_canvas THEN
    RAISE EXCEPTION 'context entry % is not available', v_id USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_link IN SELECT * FROM jsonb_array_elements(p_links) LOOP
    INSERT INTO context_links (id, entry_id, canvas_id, target_type, target_id, origin_status)
    VALUES (
      COALESCE(NULLIF(v_link->>'id', '')::UUID, gen_random_uuid()),
      v_id,
      v_canvas,
      v_link->>'target_type',
      NULLIF(v_link->>'target_id', '')::UUID,
      COALESCE(v_link->>'origin_status', 'OWNED')
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF p_attachment IS NOT NULL THEN
    INSERT INTO context_attachments
      (id, entry_id, canvas_id, storage_path, file_name, mime_type, size_bytes, width, height, alt_text)
    VALUES (
      COALESCE(NULLIF(p_attachment->>'id', '')::UUID, gen_random_uuid()),
      v_id,
      v_canvas,
      p_attachment->>'storage_path',
      p_attachment->>'file_name',
      p_attachment->>'mime_type',
      (p_attachment->>'size_bytes')::BIGINT,
      (p_attachment->>'width')::INT,
      (p_attachment->>'height')::INT,
      p_attachment->>'alt_text'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_entry;
END;
$$;
