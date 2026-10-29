import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Pool } from 'pg'

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'db', 'migrations')

// Minimal migration runner, same idea as Rails' schema_migrations table:
// each .sql file runs once, in filename order, and is recorded when it succeeds.
export async function migrate(pool: Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      ran_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const { rows } = await pool.query<{ version: string }>('SELECT version FROM schema_migrations')
  const done = new Set(rows.map((r) => r.version))

  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql') && !done.has(file))
    .sort()

  for (const file of pending) {
    const client = await pool.connect()
    try {
      // Each migration runs in a transaction: if any statement fails, nothing
      // from that file is applied and it is not marked as done.
      await client.query('BEGIN')
      await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  return pending
}

// Allows `npm run db:migrate` while keeping migrate() importable from tests.
if (require.main === module) {
  import('./pool').then(async ({ pool }) => {
    try {
      const applied = await migrate(pool)
      console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date')
    } finally {
      await pool.end()
    }
  })
}
