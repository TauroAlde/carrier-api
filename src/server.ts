import { config } from './config'
import { pool } from './db/pool'
import { createApp } from './app'
import { createCarrierStatsRepository } from './stats/carrierStatsRepository'

const app = createApp({
  carrierStats: createCarrierStatsRepository(pool),
  corsOrigins: config.corsOrigins,
})

const server = app.listen(config.port, () => {
  console.log(`carrier-api listening on http://localhost:${config.port}`)
})

// Close HTTP and DB connections cleanly on Ctrl+C or when a host stops the container.
function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
