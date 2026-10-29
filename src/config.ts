import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  // Fail at boot with a clear message instead of a vague connection error later.
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const config = {
  // Tests run against their own database so they can wipe it freely.
  databaseUrl:
    process.env.NODE_ENV === 'test' ? required('TEST_DATABASE_URL') : required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3000),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim()),
}
