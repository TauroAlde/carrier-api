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
  cancelled: number
  avg_days: string | null
}

export function createCarrierStatsRepository(pool: Pool): CarrierStatsRepository {
  return {
    async totalsByCarrier() {
      // One pass over the table: FILTER lets us compute several conditional
      // aggregates in the same GROUP BY instead of running one query per metric.
      //
      // A carrier "succeeds" when it delivers OR generates the label, and "fails"
      // when it doesn't deliver OR can't generate the label: synced sandbox data
      // only has label outcomes, sample data has delivery outcomes, and both
      // measure the same thing, whether the carrier did its job.
      // The API keeps the field names deliveries/failures so the dashboard's
      // contract doesn't change.
      //
      // Days: real delivery time when there is one, otherwise the carrier's estimate.
      const { rows } = await pool.query<Row>(`
        SELECT
          carrier,
          COUNT(*) FILTER (WHERE status IN ('delivered', 'label_created'))::int AS deliveries,
          COUNT(*) FILTER (WHERE status IN ('failed', 'label_failed'))::int     AS failures,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int                     AS cancelled,
          AVG(CASE
                WHEN status = 'delivered'
                  THEN EXTRACT(EPOCH FROM (delivered_at - shipped_at)) / 86400
                WHEN status = 'label_created'
                  THEN estimated_days
              END)                                                              AS avg_days
        FROM shipments
        GROUP BY carrier
      `)

      return rows.map((row) => ({
        carrier: row.carrier,
        deliveries: row.deliveries,
        failures: row.failures,
        cancelled: row.cancelled,
        // pg returns NUMERIC as a string to avoid losing precision; days don't
        // need that precision, so converting to a JS number is safe here.
        avgDays: row.avg_days === null ? null : Number(row.avg_days),
      }))
    },
  }
}
