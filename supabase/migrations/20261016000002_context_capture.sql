-- Migration: Text-only context capture (pivot, 2026-10-16)
--
-- Backend half of the frontend's text-context-capture feature
-- (thinking-canvas-frontend: .ai/features/text-context-capture/backend-requirements.md):
--   B1  context_entries          — typed / spoken / (later) attached context
--   B2  context_links            — which component(s) an entry is about
--   B3  nodes.seq                — stable user-visible node number (n1, n2, …)
--   B5  component_removal_reasons — "Why remove this?" answers
--   B13 edges.label              — short label typed on the edge itself
--
-- Write path: the FRONTEND writes these tables directly (supabase-js + RLS), the
-- same way it writes nodes/edges. The backend never receives a notify for them —
-- agents read them live at serialize time.
--
-- Visibility rule: an entry is visible only through an ACTIVE link and only while
-- entries.deleted_at IS NULL. An entry with no active link is invisible to
-- everyone, so a half-finished multi-row write (entry inserted, links not yet)
-- is harmless and a retry (idempotent upsert by client-generated id) completes it.

-- ─────────────────────────────────────────────
-- context_entries
-- ─────────────────────────────────────────────
CREATE TABLE context_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- the frontend generates it
  canvas_id   UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,   -- session it was written in
  content     TEXT NOT NULL,                      -- plain text; never rewritten by the system
  source      TEXT NOT NULL,                      -- typed | spoken | attachment
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- bumped by trigger on every UPDATE
  deleted_at  TIMESTAMPTZ,                        -- soft delete; undo clears it
  CONSTRAINT context_entries_source_chk
    CHECK (source IN ('typed', 'spoken', 'attachment')),
  -- Hard backstop only. The product limit (1,000 chars, shown to the user) is
  -- enforced by the frontend and moves to a settings row later.
  CONSTRAINT context_entries_content_len_chk
    CHECK (char_length(content) <= 4000),
  -- Saving an empty note creates nothing. An attachment may carry no caption.
  CONSTRAINT context_entries_content_nonempty_chk
    CHECK (source = 'attachment' OR btrim(content) <> '')
);

CREATE OR REPLACE FUNCTION context_entries_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.canvas_id IS DISTINCT FROM OLD.canvas_id OR NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'context_entries.canvas_id and .source are immutable';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_context_entries_before_update
  BEFORE UPDATE ON context_entries
  FOR EACH ROW EXECUTE FUNCTION context_entries_before_update();

-- ─────────────────────────────────────────────
-- context_links
-- One entry, many links: a note written for every node is ONE entry plus N links,
-- never N copies — one undo removes it everywhere.
-- target_id has no FK (it is polymorphic: node | edge | none), so liveness is
-- kept honest by the retire triggers below.
-- ─────────────────────────────────────────────
CREATE TABLE context_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- the frontend generates it
  entry_id    UUID NOT NULL REFERENCES context_entries(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL,                      -- canvas | node | edge   ('group' reserved for v2)
  target_id   UUID,                               -- NULL ⇔ target_kind = 'canvas' (background)
  origin      TEXT NOT NULL,                      -- user_chosen | user_moved | shortcut
  state       TEXT NOT NULL DEFAULT 'active',     -- active | deleted (removed, or its component was deleted)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT context_links_target_kind_chk
    CHECK (target_kind IN ('canvas', 'node', 'edge')),
  CONSTRAINT context_links_target_id_chk
    CHECK ((target_kind = 'canvas') = (target_id IS NULL)),
  CONSTRAINT context_links_origin_chk
    CHECK (origin IN ('user_chosen', 'user_moved', 'shortcut')),
  CONSTRAINT context_links_state_chk
    CHECK (state IN ('active', 'deleted'))
);

-- At most one ACTIVE link per entry per target (a canvas link has NULL target_id,
-- which a plain UNIQUE would treat as always-distinct, hence the COALESCE).
-- Partial, so undoing a move can re-link a target whose old link is 'deleted'.
CREATE UNIQUE INDEX uq_context_links_active_target
  ON context_links (entry_id, target_kind, COALESCE(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE state = 'active';

-- When a node/edge row is deleted, links pointing at it go 'deleted' with it.
-- (The frontend holds a delete open for its undo window and only then writes the
-- real DELETE, so there is no restore-after-delete case to support.)
CREATE OR REPLACE FUNCTION retire_context_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE context_links
     SET state = 'deleted'
   WHERE target_kind = TG_ARGV[0]
     AND target_id = OLD.id
     AND state = 'active';
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_nodes_retire_context_links
  AFTER DELETE ON nodes
  FOR EACH ROW EXECUTE FUNCTION retire_context_links('node');

CREATE TRIGGER trg_edges_retire_context_links
  AFTER DELETE ON edges
  FOR EACH ROW EXECUTE FUNCTION retire_context_links('edge');

-- ─────────────────────────────────────────────
-- component_removal_reasons
-- "Why remove this?" answers. Stored against the deleted component's kind + id and
-- deliberately WITHOUT a foreign key — the component no longer exists.
-- ─────────────────────────────────────────────
CREATE TABLE component_removal_reasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id   UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
  target_kind TEXT NOT NULL,
  target_id   UUID NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT component_removal_reasons_kind_chk
    CHECK (target_kind IN ('node', 'edge')),
  CONSTRAINT component_removal_reasons_reason_chk
    CHECK (char_length(reason) BETWEEN 1 AND 1000)
);

-- ─────────────────────────────────────────────
-- nodes.seq — stable, user-visible node number
-- Unique per canvas, assigned in creation order, NEVER reused or renumbered —
-- canvases.next_node_seq is a monotonic counter, so deleting the last node does
-- not free its number (max(seq)+1 would). The frontend never writes seq: the
-- trigger below overrides whatever an INSERT supplies.
-- Not to be confused with the serializer's `seq:N` (a prompt-text label).
-- ─────────────────────────────────────────────
ALTER TABLE canvases ADD COLUMN next_node_seq INT NOT NULL DEFAULT 1;
ALTER TABLE nodes    ADD COLUMN seq INT;

-- Backfill existing nodes per canvas in creation order (id breaks ties), then
-- point each canvas's counter past its highest number.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY canvas_id ORDER BY created_at, id) AS rn
  FROM nodes
)
UPDATE nodes n SET seq = r.rn FROM ranked r WHERE n.id = r.id;

UPDATE canvases c
   SET next_node_seq = COALESCE((SELECT MAX(n.seq) FROM nodes n WHERE n.canvas_id = c.id), 0) + 1;

ALTER TABLE nodes ALTER COLUMN seq SET NOT NULL;
-- Placeholder default so generated insert types leave seq optional (callers never
-- supply it); the BEFORE INSERT trigger below always overwrites it.
ALTER TABLE nodes ALTER COLUMN seq SET DEFAULT 0;
ALTER TABLE nodes ADD CONSTRAINT nodes_canvas_seq_key UNIQUE (canvas_id, seq);

CREATE OR REPLACE FUNCTION assign_node_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The frontend persists node edits as an upsert, which fires BEFORE INSERT even
  -- when the row already exists and is about to become an UPDATE. Reuse that
  -- row's number so an edit neither changes it nor burns a counter value.
  -- (For a brand-new id this leaves NEW.seq NULL, discarding any client value.)
  SELECT seq INTO NEW.seq FROM nodes WHERE id = NEW.id;

  IF NEW.seq IS NULL THEN
    UPDATE canvases
       SET next_node_seq = next_node_seq + 1
     WHERE id = NEW.canvas_id
    RETURNING next_node_seq - 1 INTO NEW.seq;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nodes_assign_seq
  BEFORE INSERT ON nodes
  FOR EACH ROW EXECUTE FUNCTION assign_node_seq();

CREATE OR REPLACE FUNCTION nodes_seq_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.seq IS DISTINCT FROM OLD.seq THEN
    RAISE EXCEPTION 'nodes.seq is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nodes_seq_immutable
  BEFORE UPDATE OF seq ON nodes
  FOR EACH ROW EXECUTE FUNCTION nodes_seq_immutable();

-- ─────────────────────────────────────────────
-- edges.label — a short label typed on the edge itself. That is the edge, not a
-- note. Written by the frontend; NULL = unlabelled.
-- ─────────────────────────────────────────────
ALTER TABLE edges
  ADD COLUMN label TEXT,
  ADD CONSTRAINT edges_label_len_chk CHECK (label IS NULL OR char_length(label) <= 200);

-- ─────────────────────────────────────────────
-- RLS — owner-scoped via canvas → user_id, like every table
-- ─────────────────────────────────────────────
ALTER TABLE context_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_links             ENABLE ROW LEVEL SECURITY;
ALTER TABLE component_removal_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "context_entries: owner access"
  ON context_entries FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "context_links: owner access"
  ON context_links FOR ALL
  USING (
    entry_id IN (
      SELECT e.id
      FROM context_entries e
      JOIN canvases c ON c.id = e.canvas_id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "component_removal_reasons: owner access"
  ON component_removal_reasons FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_context_entries_canvas_id
  ON context_entries(canvas_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_context_links_entry_id
  ON context_links(entry_id);

-- "all notes on this node/edge" and the retire triggers
CREATE INDEX IF NOT EXISTS idx_context_links_active_target
  ON context_links(target_kind, target_id) WHERE state = 'active';

CREATE INDEX IF NOT EXISTS idx_component_removal_reasons_canvas_id
  ON component_removal_reasons(canvas_id);
