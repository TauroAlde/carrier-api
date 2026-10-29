// Load .env here too: --inspect never imports the DB config, which is what loads it elsewhere.
import 'dotenv/config'
import type { Pool } from 'pg'
import type { SkydropxClient } from './client'
import { mapShipment, type ShipmentRecord } from './mapShipment'

// Safety net: stop after this many pages even if the API keeps answering,
// so a pagination bug can't turn into an endless loop of requests.
const MAX_PAGES = 100

export type SyncResult = { fetched: number; saved: number; skipped: number; pages: number }

export async function syncShipments(client: SkydropxClient, pool: Pool): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, saved: 0, skipped: 0, pages: 0 }

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { items, totalPages } = await client.listShipments(page)
    result.pages = page
    result.fetched += items.length

    const records = items.map(mapShipment).filter((r): r is ShipmentRecord => r !== null)
    result.skipped += items.length - records.length

    for (const record of records) {
      await upsert(pool, record)
      result.saved++
    }

    // Stop on an empty page, or when the API tells us this was the last one.
    if (items.length === 0 || (totalPages !== null && page >= totalPages)) break
  }

  return result
}

// ON CONFLICT makes the sync idempotent: running it twice updates the same rows
// (new status, new delivery date) instead of counting shipments twice.
async function upsert(pool: Pool, r: ShipmentRecord) {
  await pool.query(
    `INSERT INTO shipments (skydropx_id, carrier, tracking_number, status, raw_status, shipped_at, delivered_at, estimated_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (skydropx_id) DO UPDATE SET
       carrier = EXCLUDED.carrier,
       tracking_number = EXCLUDED.tracking_number,
       status = EXCLUDED.status,
       raw_status = EXCLUDED.raw_status,
       shipped_at = EXCLUDED.shipped_at,
       delivered_at = EXCLUDED.delivered_at,
       estimated_days = EXCLUDED.estimated_days`,
    [r.skydropxId, r.carrier, r.trackingNumber, r.status, r.rawStatus, r.shippedAt, r.deliveredAt, r.estimatedDays],
  )
}

// Removes the seed's sample rows (they have no skydropx_id) so the dashboard
// shows only real sandbox data. Opt-in via --clear-sample because it deletes data.
export async function clearSampleShipments(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query('DELETE FROM shipments WHERE skydropx_id IS NULL')
  return rowCount ?? 0
}

// CLI: npm run skydropx:sync [-- --inspect] [-- --clear-sample]
if (require.main === module) {
  ;(async () => {
    const { createSkydropxClient, skydropxConfigFromEnv } = await import('./client')
    const client = createSkydropxClient(skydropxConfigFromEnv())
    const args = process.argv.slice(2)

    // --inspect only prints what the API returns, without touching the database.
    // Use it the first time to check the field names mapShipment expects.
    if (args.includes('--inspect')) {
      const { items, totalPages } = await client.listShipments(1)
      console.log(`Page 1: ${items.length} shipments, total_pages: ${totalPages ?? 'not reported'}`)
      console.log('First item (raw):', JSON.stringify(items[0] ?? null, null, 2))
      console.log('Mapped:', items[0] ? mapShipment(items[0]) : null)
      return
    }

    const { pool } = await import('../db/pool')
    try {
      if (args.includes('--clear-sample')) {
        console.log(`Removed ${await clearSampleShipments(pool)} sample shipments`)
      }
      const r = await syncShipments(client, pool)
      console.log(`Synced ${r.saved} of ${r.fetched} shipments in ${r.pages} page(s), skipped ${r.skipped}`)
    } finally {
      await pool.end()
    }
  })().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
