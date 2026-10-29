import { pool } from '../db/pool'
import { migrate } from '../db/migrate'
import { createCarrierStatsRepository } from './carrierStatsRepository'

// Integration test: runs the real SQL against the test database
// (TEST_DATABASE_URL), because a fake can't prove the query is correct.
const repository = createCarrierStatsRepository(pool)

beforeAll(async () => {
  await migrate(pool)
})

beforeEach(async () => {
  await pool.query('TRUNCATE shipments RESTART IDENTITY')
})

afterAll(async () => {
  await pool.end()
})

async function insertShipment(carrier: string, status: string, days: number | null, estimatedDays: number | null = null) {
  await pool.query(
    `INSERT INTO shipments (carrier, status, shipped_at, delivered_at, estimated_days)
     VALUES ($1, $2, '2026-01-01T00:00:00Z', $3, $4)`,
    [carrier, status, days === null ? null : new Date(Date.UTC(2026, 0, 1) + days * 86_400_000), estimatedDays],
  )
}

describe('totalsByCarrier', () => {
  it('aggregates deliveries, failures and average delivery days per carrier', async () => {
    await insertShipment('dhl', 'delivered', 1)
    await insertShipment('dhl', 'delivered', 3)
    await insertShipment('dhl', 'failed', null)
    await insertShipment('dhl', 'in_transit', null)
    await insertShipment('estafeta', 'failed', null)

    const totals = await repository.totalsByCarrier()
    const byCarrier = Object.fromEntries(totals.map((t) => [t.carrier, t]))

    expect(byCarrier.dhl).toEqual({ carrier: 'dhl', deliveries: 2, failures: 1, cancelled: 0, avgDays: 2 })
    // No deliveries means there is no delivery time to average.
    expect(byCarrier.estafeta).toEqual({ carrier: 'estafeta', deliveries: 0, failures: 1, cancelled: 0, avgDays: null })
  })

  it('counts label outcomes as successes and failures, and cancellations apart', async () => {
    await insertShipment('fedex', 'label_created', null, 2)
    await insertShipment('fedex', 'label_created', null, 4)
    await insertShipment('fedex', 'label_failed', null)
    await insertShipment('fedex', 'cancelled', null)

    const [fedex] = await repository.totalsByCarrier()

    // Labels have no delivery date yet, so days are the carrier's estimate.
    expect(fedex).toEqual({ carrier: 'fedex', deliveries: 2, failures: 1, cancelled: 1, avgDays: 3 })
  })

  it('returns an empty list when there are no shipments', async () => {
    expect(await repository.totalsByCarrier()).toEqual([])
  })

  it('rejects a delivered shipment without a delivery date', async () => {
    await expect(insertShipment('dhl', 'delivered', null)).rejects.toThrow(/delivered_at_matches_status/)
  })
})
