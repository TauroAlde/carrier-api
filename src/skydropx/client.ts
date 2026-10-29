// Minimal Skydropx API client: OAuth client-credentials token + paginated shipment list.
// Same auth flow as SkydropxAuthService in shipping_api_2.

export type SkydropxConfig = {
  baseUrl: string
  clientId: string
  clientSecret: string
}

export type ShipmentPage = {
  items: Record<string, unknown>[]
  totalPages: number | null
}

export interface SkydropxClient {
  listShipments(page: number): Promise<ShipmentPage>
}

// Injecting fetch lets tests replace the network without any mocking library.
type Fetch = typeof fetch

export function skydropxConfigFromEnv(env = process.env): SkydropxConfig {
  const missing = ['SKYDROPX_BASE_URL', 'SKYDROPX_CLIENT_ID', 'SKYDROPX_CLIENT_SECRET'].filter(
    (name) => !env[name],
  )
  if (missing.length) throw new Error(`Missing Skydropx settings in .env: ${missing.join(', ')}`)

  return {
    // Trailing slashes would produce "//api/v1" URLs.
    baseUrl: env.SKYDROPX_BASE_URL!.replace(/\/+$/, ''),
    clientId: env.SKYDROPX_CLIENT_ID!,
    clientSecret: env.SKYDROPX_CLIENT_SECRET!,
  }
}

export function createSkydropxClient(config: SkydropxConfig, fetchFn: Fetch = fetch): SkydropxClient {
  let token: { value: string; expiresAt: number } | null = null

  async function getToken(): Promise<string> {
    // Reuse the token until shortly before it expires: asking for a new one on
    // every page would be slow and could hit the auth endpoint's rate limit.
    if (token && Date.now() < token.expiresAt) return token.value

    const response = await fetchFn(`${config.baseUrl}/api/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'client_credentials',
        // Read-only use: we only list shipments, so we don't ask for orders.create.
        scope: 'default',
      }),
    })

    if (!response.ok) {
      // Never log the body of the request: it contains the client secret.
      throw new Error(`Skydropx auth failed with status ${response.status}`)
    }

    const body = (await response.json()) as { access_token: string; expires_in?: number }
    const lifetimeMs = (body.expires_in ?? 3600) * 1000
    token = { value: body.access_token, expiresAt: Date.now() + lifetimeMs - 60_000 }
    return token.value
  }

  return {
    async listShipments(page) {
      const response = await fetchFn(`${config.baseUrl}/api/v1/shipments?page=${page}`, {
        headers: { Authorization: `Bearer ${await getToken()}`, Accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`Skydropx shipments request failed with status ${response.status}`)
      }

      const body = (await response.json()) as Record<string, unknown>
      // Accept both { data: [...], meta: {...} } and a bare array.
      const items = (Array.isArray(body) ? body : (body.data as unknown[]) ?? []) as Record<string, unknown>[]
      const meta = (body.meta ?? {}) as Record<string, unknown>
      const totalPages = typeof meta.total_pages === 'number' ? meta.total_pages : null

      return { items, totalPages }
    },
  }
}
