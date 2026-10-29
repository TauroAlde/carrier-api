-- One row per shipment. Carrier stats are computed from this table on the fly
-- (see carrierStatsRepository.ts) instead of keeping a pre-aggregated table,
-- so the numbers can never drift out of sync with the shipments themselves.
CREATE TABLE shipments (
  id            BIGSERIAL PRIMARY KEY,
  carrier       TEXT        NOT NULL,
  status        TEXT        NOT NULL CHECK (status IN ('in_transit', 'delivered', 'failed')),
  shipped_at    TIMESTAMPTZ NOT NULL,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A delivered shipment must have a delivery date, and nothing else may have one.
  -- Enforcing it in the database protects the avg_days calculation from bad data.
  CONSTRAINT delivered_at_matches_status
    CHECK ((status = 'delivered') = (delivered_at IS NOT NULL)),
  CONSTRAINT delivered_after_shipped
    CHECK (delivered_at IS NULL OR delivered_at >= shipped_at)
);

-- The stats query groups by carrier.
CREATE INDEX index_shipments_on_carrier ON shipments (carrier);
