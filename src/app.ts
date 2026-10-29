import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import type { CarrierStatsRepository } from './stats/carrierStatsRepository'
import { rankCarriers } from './stats/carrierStats'

type Dependencies = {
  carrierStats: CarrierStatsRepository
  corsOrigins: string[]
}

// The app is built from injected dependencies instead of importing the DB pool
// directly, so tests can create it with a fake repository (see app.test.ts).
export function createApp({ carrierStats, corsOrigins }: Dependencies) {
  const app = express()

  // Only the dashboard's origin may call the API from a browser.
  app.use(cors({ origin: corsOrigins }))
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // Express 5 forwards rejected promises to the error handler,
  // so async routes don't need their own try/catch.
  app.get('/stats/carriers', async (_req, res) => {
    const totals = await carrierStats.totalsByCarrier()
    res.json(rankCarriers(totals))
  })

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Log the real error on the server but never leak internals (SQL, stack) to clients.
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
