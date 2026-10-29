import { buildCarrierStat, performanceScore, rankCarriers, statusLabel } from './carrierStats'

describe('statusLabel', () => {
  it.each([
    [0.95, 'excellent'],
    [0.85, 'good'],
    [0.7, 'warning'],
    [0.69, 'bad'],
  ])('labels a %p success rate as %p', (rate, label) => {
    expect(statusLabel(rate, 10)).toBe(label)
  })

  it('is unknown only when there are no finished shipments', () => {
    expect(statusLabel(0, 0)).toBe('unknown')
  })

  it('labels a carrier that failed every shipment as bad, not unknown', () => {
    expect(statusLabel(0, 2)).toBe('bad')
  })
})

describe('performanceScore', () => {
  it('weights success 70% and speed 30%', () => {
    // 1.0 * 0.7 + (1 / 2 days) * 0.3 = 0.85
    expect(performanceScore(1, 2)).toBe(0.85)
  })

  it('uses a neutral speed when there are no delivery times', () => {
    expect(performanceScore(0, null)).toBe(0.15)
  })

  it('never exceeds 1, even for same-day deliveries', () => {
    expect(performanceScore(1, 0.2)).toBe(1)
    expect(performanceScore(1, 0)).toBe(1)
  })
})

describe('buildCarrierStat', () => {
  it('ignores in-transit and cancelled shipments when computing the success rate', () => {
    const stat = buildCarrierStat({ carrier: 'dhl', deliveries: 9, failures: 1, cancelled: 3, avgDays: 2.345 })

    expect(stat).toEqual({
      carrier: 'dhl',
      success_rate: 0.9,
      avg_days: 2.35,
      total_shipments: 10,
      deliveries: 9,
      failures: 1,
      cancelled: 3,
      performance_score: 0.76,
      status: 'good',
    })
  })

  it('handles a carrier with no finished shipments without dividing by zero', () => {
    const stat = buildCarrierStat({ carrier: 'new', deliveries: 0, failures: 0, cancelled: 4, avgDays: null })

    expect(stat).toMatchObject({ success_rate: 0, total_shipments: 0, status: 'unknown' })
  })
})

describe('rankCarriers', () => {
  it('sorts carriers by performance score, best first', () => {
    const ranked = rankCarriers([
      { carrier: 'slow', deliveries: 5, failures: 5, cancelled: 0, avgDays: 6 },
      { carrier: 'fast', deliveries: 10, failures: 0, cancelled: 0, avgDays: 1 },
    ])

    expect(ranked.map((c) => c.carrier)).toEqual(['fast', 'slow'])
  })
})
