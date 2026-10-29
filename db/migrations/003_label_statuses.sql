-- The Skydropx shipment list reports the label's lifecycle (workflow_status),
-- not delivery tracking. New statuses record that truthfully instead of
-- pretending a generated label was "delivered":
--   label_created  the carrier generated the label (counts as a success)
--   label_failed   the carrier could not generate it (counts as a failure)
--   cancelled      the user cancelled it (excluded from success rates)
ALTER TABLE shipments DROP CONSTRAINT shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check CHECK (
  status IN ('in_transit', 'delivered', 'failed', 'label_created', 'label_failed', 'cancelled')
);

-- Delivery days estimated by the carrier when the label was created. Used as
-- the delivery time for labels, since they have no real delivery date yet.
ALTER TABLE shipments ADD COLUMN estimated_days NUMERIC
  CHECK (estimated_days IS NULL OR estimated_days >= 0);
