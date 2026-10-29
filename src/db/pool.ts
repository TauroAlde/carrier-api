import { Pool } from 'pg'
import { config } from '../config'

// A pool reuses connections between requests; opening a new connection
// per query is slow and can exhaust Postgres' connection limit.
export const pool = new Pool({ connectionString: config.databaseUrl })
