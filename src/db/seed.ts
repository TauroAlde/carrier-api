import type { Pool } from 'pg'

// Each carrier gets a different profile so the dashboard shows every status.
// A carrier with only in-transit shipments shows how the dashboard handles "no data".
const PROFILES = [
  { carrier: 'dhl', count: 120, successRate: 0.99, avgDays: 1.8 },
  { carrier: 'fedex', count: 90, successRate: 0.92, avgDays: 2.5 },
  { carrier: 'estafeta', count: 150, successRate: 0.82, avgDays: 3.4 },
  { carrier: 'paquetexpress', count: 60, successRate: 0.74, avgDays: 4.2 },
  { carrier: 'redpack', count: 45, successRate: 0.6, avgDays: 5.1 },
  { carrier: 'ups', count: 8, successRate: 0, avgDays: 0, inTransitOnly: true },
]

// Deterministic pseudo-random generator: every run produces the same data,
// which makes screenshots and manual checks reproducible.
function seededRandom(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const DAY_MS = 86_400_000

export async function seed(pool: Pool) {
  const random = seededRandom(42)
  const now = Date.now()
  const rows: unknown[][] = []

  for (const p of PROFILES) {
    for (let i = 0; i < p.count; i++) {
      const shippedAt = new Date(now - (10 + random() * 60) * DAY_MS)
      const roll = random()

      // ~5% stay in transit, the rest succeed or fail according to the profile.
      if (p.inTransitOnly || roll < 0.05) {
        rows.push([p.carrier, 'in_transit', shippedAt, null])
      } else if (random() < p.successRate) {
        const days = Math.max(0.5, p.avgDays + (random() - 0.5) * 2)
        rows.push([p.carrier, 'delivered', shippedAt, new Date(shippedAt.getTime() + days * DAY_MS)])
      } else {
        rows.push([p.carrier, 'failed', shippedAt, null])
      }
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Seeding replaces all data, so it can be re-run safely.
    await client.query('TRUNCATE shipments RESTART IDENTITY')
    for (const row of rows) {
      // Parameterized query ($1, $2…): values are never concatenated into SQL,
      // which is what prevents SQL injection.
      await client.query(
        'INSERT INTO shipments (carrier, status, shipped_at, delivered_at) VALUES ($1, $2, $3, $4)',
        row,
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  return rows.length
}

if (require.main === module) {
  import('./pool').then(async ({ pool }) => {
    try {
      console.log(`Seeded ${await seed(pool)} shipments`)
    } finally {
      await pool.end()
    }
  })
}
