import type { Pool } from 'pg'
import type { CarrierTotals } from './carrierStats'

// The repository is the only place that knows SQL. Routes depend on this
// interface, which lets tests swap in an in-memory fake without a database.
export interface CarrierStatsRepository {
  totalsByCarrier(): Promise<CarrierTotals[]>
}

type Row = {
  carrier: string
  deliveries: number
  failures: number
  avg_days: string | null
}

export function createCarrierStatsRepository(pool: Pool): CarrierStatsRepository {
  return {
    async totalsByCarrier() {
      // One pass over the table: FILTER lets us compute several conditional
      // aggregates in the same GROUP BY instead of running one query per metric.
      const { rows } = await pool.query<Row>(`
        SELECT
          carrier,
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS deliveries,
          COUNT(*) FILTER (WHERE status = 'failed')::int    AS failures,
          AVG(EXTRACT(EPOCH FROM (delivered_at - shipped_at)) / 86400)
            FILTER (WHERE status = 'delivered')              AS avg_days
        FROM shipments
        GROUP BY carrier
      `)

      return rows.map((row) => ({
        carrier: row.carrier,
        deliveries: row.deliveries,
        failures: row.failures,
        // pg returns NUMERIC as a string to avoid losing precision; days don't
        // need that precision, so converting to a JS number is safe here.
        avgDays: row.avg_days === null ? null : Number(row.avg_days),
      }))
    },
  }
}
