-- Shipments synced from Skydropx keep their external id so a re-sync updates
-- the same row instead of inserting a duplicate. Sample rows from the seed
-- have no skydropx_id, which is how the sync tells them apart.
ALTER TABLE shipments
  ADD COLUMN skydropx_id     TEXT UNIQUE,
  ADD COLUMN tracking_number TEXT,
  -- The status exactly as Skydropx reports it (e.g. "returned"). `status`
  -- keeps only our 3 buckets, but the original helps debug the mapping.
  ADD COLUMN raw_status      TEXT;
