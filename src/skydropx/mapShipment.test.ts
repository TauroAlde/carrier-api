import { mapShipment, mapTrackingStatus, mapWorkflowStatus } from './mapShipment'

describe('mapTrackingStatus', () => {
  it.each([
    ['delivered', 'delivered'],
    ['DELIVERED', 'delivered'],
    ['failed', 'failed'],
    ['returned', 'failed'],
    ['cancelled', 'failed'],
    ['exception', 'failed'],
    ['in_transit', 'in_transit'],
    ['pending', 'in_transit'],
    [null, 'in_transit'],
  ])('maps %p to %p', (raw, expected) => {
    expect(mapTrackingStatus(raw)).toBe(expected)
  })
})

describe('mapWorkflowStatus', () => {
  it.each([
    ['success', 'label_created'],
    ['error', 'label_failed'],
    ['cancelled', 'cancelled'],
    ['in_progress', 'in_transit'],
    ['in_creation', 'in_transit'],
  ])('maps %p to %p', (raw, expected) => {
    expect(mapWorkflowStatus(raw)).toBe(expected)
  })
})

describe('mapShipment', () => {
  it('reads a JSON:API style item', () => {
    const record = mapShipment({
      id: 'shp_1',
      attributes: {
        carrier_name: 'DHL',
        tracking_number: '123',
        tracking_status: 'delivered',
        created_at: '2026-10-01T10:00:00Z',
        updated_at: '2026-10-03T10:00:00Z',
      },
    })

    expect(record).toEqual({
      skydropxId: 'shp_1',
      carrier: 'dhl',
      trackingNumber: '123',
      status: 'delivered',
      rawStatus: 'delivered',
      shippedAt: new Date('2026-10-01T10:00:00Z'),
      // No delivered_at in the payload, so updated_at is used as the proxy.
      deliveredAt: new Date('2026-10-03T10:00:00Z'),
      estimatedDays: null,
    })
  })

  it('reads a flat item and prefers delivered_at when present', () => {
    const record = mapShipment({
      id: 42,
      carrier: 'Estafeta',
      tracking_status: 'delivered',
      created_at: '2026-10-01T00:00:00Z',
      delivered_at: '2026-10-02T00:00:00Z',
      updated_at: '2026-10-09T00:00:00Z',
    })

    expect(record).toMatchObject({ skydropxId: '42', carrier: 'estafeta' })
    expect(record?.deliveredAt).toEqual(new Date('2026-10-02T00:00:00Z'))
  })

  it('never puts the delivery before the ship date', () => {
    const record = mapShipment({
      id: 'shp_2',
      carrier: 'fedex',
      tracking_status: 'delivered',
      created_at: '2026-10-05T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    })

    expect(record?.deliveredAt).toEqual(record?.shippedAt)
  })

  it('leaves the delivery date empty for shipments that were not delivered', () => {
    const record = mapShipment({ id: 'shp_3', carrier: 'ups', tracking_status: 'exception', created_at: '2026-10-01' })
    expect(record).toMatchObject({ status: 'failed', rawStatus: 'exception', deliveredAt: null })
  })

  it('maps the real Skydropx list shape (workflow_status, no tracking)', () => {
    // Trimmed from a real sandbox response (npm run skydropx:sync -- --inspect).
    const record = mapShipment({
      id: 'a8d9b97a',
      type: 'shipment',
      attributes: {
        carrier_name: 'fedex',
        workflow_status: 'error',
        created_at: '2025-06-03T09:26:53.363-06:00',
        updated_at: '2025-06-03T11:41:59.051-06:00',
        master_tracking_number: null,
        estimated_delivery_days: 2,
      },
    })

    expect(record).toEqual({
      skydropxId: 'a8d9b97a',
      carrier: 'fedex',
      trackingNumber: null,
      status: 'label_failed',
      rawStatus: 'error',
      shippedAt: new Date('2025-06-03T15:26:53.363Z'),
      deliveredAt: null,
      estimatedDays: 2,
    })
  })

  it('prefers delivery tracking over the label status when both are present', () => {
    const record = mapShipment({ id: '1', carrier: 'dhl', workflow_status: 'success', tracking_status: 'delivered', created_at: '2026-10-01' })
    expect(record?.status).toBe('delivered')
  })

  it('skips items missing the id, carrier or creation date', () => {
    expect(mapShipment({ carrier: 'dhl', created_at: '2026-10-01' })).toBeNull()
    expect(mapShipment({ id: '1', created_at: '2026-10-01' })).toBeNull()
    expect(mapShipment({ id: '1', carrier: 'dhl', created_at: 'not a date' })).toBeNull()
  })
})
