import { pool } from '../db/pool'
import { migrate } from '../db/migrate'
import { createCarrierStatsRepository } from '../stats/carrierStatsRepository'
import type { SkydropxClient } from './client'
import { clearSampleShipments, syncShipments } from './sync'

// Integration test: a fake Skydropx client feeds real SQL in the test database.
function fakeClient(pages: Record<string, unknown>[][]): SkydropxClient {
  return {
    listShipments: async (page) => ({ items: pages.at(page - 1) ?? [], totalPages: pages.length }),
  }
}

const shipment = (id: string, carrier: string, status: string) => ({
  id,
  attributes: { carrier_name: carrier, tracking_status: status, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-03T00:00:00Z' },
})

beforeAll(async () => {
  await migrate(pool)
})

beforeEach(async () => {
  await pool.query('TRUNCATE shipments RESTART IDENTITY')
})

afterAll(async () => {
  await pool.end()
})

describe('syncShipments', () => {
  it('saves every page and feeds the stats query', async () => {
    const client = fakeClient([
      [shipment('a', 'DHL', 'delivered'), shipment('b', 'DHL', 'exception')],
      [shipment('c', 'Estafeta', 'in_transit'), { id: 'bad' }],
    ])

    const result = await syncShipments(client, pool)

    expect(result).toEqual({ fetched: 4, saved: 3, skipped: 1, pages: 2 })
    const totals = await createCarrierStatsRepository(pool).totalsByCarrier()
    const dhl = totals.find((t) => t.carrier === 'dhl')
    expect(dhl).toEqual({ carrier: 'dhl', deliveries: 1, failures: 1, cancelled: 0, avgDays: 2 })
  })

  it('stores label outcomes from the real list shape', async () => {
    const label = (id: string, status: string) => ({
      id,
      attributes: { carrier_name: 'fedex', workflow_status: status, created_at: '2026-10-01T00:00:00Z', estimated_delivery_days: 3 },
    })

    await syncShipments(fakeClient([[label('a', 'success'), label('b', 'error'), label('c', 'cancelled')]]), pool)

    const [fedex] = await createCarrierStatsRepository(pool).totalsByCarrier()
    expect(fedex).toEqual({ carrier: 'fedex', deliveries: 1, failures: 1, cancelled: 1, avgDays: 3 })
  })

  it('is idempotent: a second sync updates rows instead of duplicating them', async () => {
    await syncShipments(fakeClient([[shipment('a', 'DHL', 'in_transit')]]), pool)
    await syncShipments(fakeClient([[shipment('a', 'DHL', 'delivered')]]), pool)

    const { rows } = await pool.query('SELECT status FROM shipments')
    expect(rows).toEqual([{ status: 'delivered' }])
  })

  it('stops after the first empty page when the API reports no total', async () => {
    const calls: number[] = []
    const client: SkydropxClient = {
      listShipments: async (page) => {
        calls.push(page)
        return { items: page === 1 ? [shipment('a', 'DHL', 'delivered')] : [], totalPages: null }
      },
    }

    await syncShipments(client, pool)

    expect(calls).toEqual([1, 2])
  })
})

describe('clearSampleShipments', () => {
  it('removes only rows that did not come from Skydropx', async () => {
    await pool.query(
      `INSERT INTO shipments (carrier, status, shipped_at) VALUES ('sample', 'in_transit', now())`,
    )
    await syncShipments(fakeClient([[shipment('a', 'DHL', 'delivered')]]), pool)

    expect(await clearSampleShipments(pool)).toBe(1)
    const { rows } = await pool.query('SELECT carrier FROM shipments')
    expect(rows).toEqual([{ carrier: 'dhl' }])
  })
})
