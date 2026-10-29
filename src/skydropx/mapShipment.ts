// Turns one shipment from the Skydropx API into a row for our `shipments` table.
// Pure function, so the mapping rules are unit tested without any HTTP call.

export type ShipmentStatus =
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'label_created'
  | 'label_failed'
  | 'cancelled'

export type ShipmentRecord = {
  skydropxId: string
  carrier: string
  trackingNumber: string | null
  status: ShipmentStatus
  rawStatus: string | null
  shippedAt: Date
  deliveredAt: Date | null
  estimatedDays: number | null
}

const normalize = (raw: string | null) => raw?.toLowerCase().trim() ?? ''

// Delivery tracking (tracking_status): "delivered" is a success. "failed",
// "returned", "cancelled" and "exception" count against the carrier, as in the
// Rails webhook job plus "exception". Anything else is still on its way.
const FAILED_TRACKING = new Set(['failed', 'returned', 'cancelled', 'canceled', 'exception'])

export function mapTrackingStatus(raw: string | null): ShipmentStatus {
  const status = normalize(raw)
  if (status === 'delivered') return 'delivered'
  if (FAILED_TRACKING.has(status)) return 'failed'
  return 'in_transit'
}

// Label lifecycle (workflow_status), which is what the shipment list returns:
// "success" = the carrier generated the label, "error" = it could not.
// "cancelled" is always a user action, so it must not count against the carrier.
// "in_progress" / "in_creation" have no outcome yet.
export function mapWorkflowStatus(raw: string | null): ShipmentStatus {
  const status = normalize(raw)
  if (status === 'success') return 'label_created'
  if (status === 'error') return 'label_failed'
  if (status === 'cancelled' || status === 'canceled') return 'cancelled'
  return 'in_transit'
}

type Json = Record<string, unknown>

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : typeof value === 'number' ? String(value) : null

const date = (value: unknown): Date | null => {
  const text = str(value)
  if (!text) return null
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const nonNegative = (value: unknown): number | null => {
  // Checked before converting: Number(null) is 0, which would turn a missing
  // estimate into a 0-day delivery and inflate the carrier's speed.
  const text = typeof value === 'number' ? null : str(value)
  if (typeof value !== 'number' && text === null) return null
  const n = typeof value === 'number' ? value : Number(text)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// The API returns JSON:API style ({ id, attributes: {...} }); a flat object is
// accepted too, with a couple of field names per value, so a slightly different
// shape doesn't break the sync. `npm run skydropx:sync -- --inspect` shows the real one.
export function mapShipment(item: Json): ShipmentRecord | null {
  const attrs = (item.attributes as Json | undefined) ?? item

  const skydropxId = str(item.id) ?? str(attrs.id)
  const carrier = str(attrs.carrier_name) ?? str(attrs.carrier) ?? str(attrs.provider)
  const shippedAt = date(attrs.created_at)

  // Without these we can't place the shipment in the stats, so it is skipped
  // (the sync reports how many were skipped instead of failing the whole run).
  if (!skydropxId || !carrier || !shippedAt) return null

  // Real delivery tracking wins when present; otherwise fall back to the label lifecycle.
  const tracking = str(attrs.tracking_status)
  const workflow = str(attrs.workflow_status) ?? str(attrs.status)
  const status = tracking ? mapTrackingStatus(tracking) : mapWorkflowStatus(workflow)

  // A delivered shipment needs a delivery date (the table enforces it).
  // If the API doesn't send one, the last update is the closest proxy;
  // it is never allowed to be earlier than the ship date.
  let deliveredAt: Date | null = null
  if (status === 'delivered') {
    const candidate = date(attrs.delivered_at) ?? date(attrs.updated_at) ?? shippedAt
    deliveredAt = candidate < shippedAt ? shippedAt : candidate
  }

  return {
    skydropxId,
    carrier: carrier.toLowerCase(),
    trackingNumber: str(attrs.tracking_number) ?? str(attrs.master_tracking_number),
    status,
    rawStatus: tracking ?? workflow,
    shippedAt,
    deliveredAt,
    estimatedDays: nonNegative(attrs.estimated_delivery_days),
  }
}
