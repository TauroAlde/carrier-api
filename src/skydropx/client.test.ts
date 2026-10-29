import { createSkydropxClient, skydropxConfigFromEnv } from './client'

const config = { baseUrl: 'https://sandbox.example', clientId: 'id', clientSecret: 'secret' }

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response
}

// A fake fetch that answers the token endpoint and the shipments endpoint.
function fakeFetch(shipmentsBody: unknown) {
  return jest.fn(async (url: string | URL | Request) =>
    String(url).endsWith('/oauth/token')
      ? jsonResponse({ access_token: 'tok', expires_in: 7200 })
      : jsonResponse(shipmentsBody),
  )
}

describe('createSkydropxClient', () => {
  it('sends the bearer token and reads JSON:API pages', async () => {
    const fetchFn = fakeFetch({ data: [{ id: '1' }], meta: { total_pages: 3 } })
    const client = createSkydropxClient(config, fetchFn as unknown as typeof fetch)

    const page = await client.listShipments(2)

    expect(page).toEqual({ items: [{ id: '1' }], totalPages: 3 })
    const [url, init] = fetchFn.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('https://sandbox.example/api/v1/shipments?page=2')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('reuses the token across pages instead of asking for a new one', async () => {
    const fetchFn = fakeFetch({ data: [] })
    const client = createSkydropxClient(config, fetchFn as unknown as typeof fetch)

    await client.listShipments(1)
    await client.listShipments(2)

    const tokenCalls = fetchFn.mock.calls.filter(([url]) => String(url).endsWith('/oauth/token'))
    expect(tokenCalls).toHaveLength(1)
  })

  it('accepts a bare array response', async () => {
    const client = createSkydropxClient(config, fakeFetch([{ id: '1' }]) as unknown as typeof fetch)
    expect(await client.listShipments(1)).toEqual({ items: [{ id: '1' }], totalPages: null })
  })

  it('fails with the status code when auth is rejected, without leaking the secret', async () => {
    const fetchFn = jest.fn(async () => jsonResponse({ error: 'invalid_client' }, 401))
    const client = createSkydropxClient(config, fetchFn as unknown as typeof fetch)

    await expect(client.listShipments(1)).rejects.toThrow('Skydropx auth failed with status 401')
    await expect(client.listShipments(1)).rejects.not.toThrow(/secret/)
  })
})

describe('skydropxConfigFromEnv', () => {
  it('lists every missing setting', () => {
    expect(() => skydropxConfigFromEnv({ SKYDROPX_BASE_URL: 'x' })).toThrow(
      'Missing Skydropx settings in .env: SKYDROPX_CLIENT_ID, SKYDROPX_CLIENT_SECRET',
    )
  })

  it('strips trailing slashes from the base URL', () => {
    const cfg = skydropxConfigFromEnv({
      SKYDROPX_BASE_URL: 'https://sandbox.example/',
      SKYDROPX_CLIENT_ID: 'id',
      SKYDROPX_CLIENT_SECRET: 's',
    })
    expect(cfg.baseUrl).toBe('https://sandbox.example')
  })
})
