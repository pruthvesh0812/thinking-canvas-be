-- pgvector cosine similarity search for semantic_promote cursor tool.
-- Called via db.rpc('match_nodes', { query_embedding, canvas_id_filter, match_threshold, match_count })

CREATE OR REPLACE FUNCTION match_nodes(
  query_embedding    VECTOR(3072),
  canvas_id_filter   UUID,
  match_threshold    FLOAT,
  match_count        INT
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  summary     TEXT,
  similarity  FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    n.id,
    n.content,
    n.summary,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM nodes n
  WHERE
    n.canvas_id = canvas_id_filter
    AND n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) >= match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
$$;
