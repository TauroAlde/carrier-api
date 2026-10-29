import request from 'supertest'
import { createApp } from './app'
import type { CarrierStatsRepository } from './stats/carrierStatsRepository'

// These tests exercise HTTP behavior only, so a fake repository replaces the
// database. The SQL itself is covered in carrierStatsRepository.test.ts.
function buildApp(carrierStats: CarrierStatsRepository) {
  return createApp({ carrierStats, corsOrigins: ['http://localhost:5173'] })
}

const fakeRepository: CarrierStatsRepository = {
  totalsByCarrier: async () => [
    { carrier: 'estafeta', deliveries: 8, failures: 2, cancelled: 0, avgDays: 3 },
    { carrier: 'dhl', deliveries: 10, failures: 0, cancelled: 1, avgDays: 2 },
  ],
}

describe('GET /stats/carriers', () => {
  it('returns carriers ranked by performance score', async () => {
    const res = await request(buildApp(fakeRepository)).get('/stats/carriers')

    expect(res.status).toBe(200)
    expect(res.body.map((c: { carrier: string }) => c.carrier)).toEqual(['dhl', 'estafeta'])
    expect(res.body[0]).toMatchObject({ success_rate: 1, status: 'excellent', total_shipments: 10 })
  })

  it('allows requests from the dashboard origin', async () => {
    const res = await request(buildApp(fakeRepository))
      .get('/stats/carriers')
      .set('Origin', 'http://localhost:5173')

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('does not allow other origins', async () => {
    const res = await request(buildApp(fakeRepository))
      .get('/stats/carriers')
      .set('Origin', 'https://evil.example')

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('responds with a generic 500 and hides the internal error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const failing: CarrierStatsRepository = {
      totalsByCarrier: async () => {
        throw new Error('relation "shipments" does not exist')
      },
    }

    const res = await request(buildApp(failing)).get('/stats/carriers')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
  })
})

describe('other routes', () => {
  it('exposes a health check', async () => {
    const res = await request(buildApp(fakeRepository)).get('/health')
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(buildApp(fakeRepository)).get('/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })
})
