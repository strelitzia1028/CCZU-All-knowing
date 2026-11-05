BEGIN;

ALTER TABLE knowledge_items
  ADD COLUMN IF NOT EXISTS source_id varchar(36);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_items_source_unique
  ON knowledge_items USING btree (source_id);

COMMIT;
