// Business rules for carrier stats, ported from the Rails StatsController in
// shipping_api_2 so the dashboard keeps receiving the exact same contract.
// They are pure functions (no DB, no HTTP) so they can be unit tested directly.

export type CarrierStatus = 'excellent' | 'good' | 'warning' | 'bad' | 'unknown'

// Raw aggregate per carrier, as returned by the database query.
// `deliveries` / `failures` are successes and failures of the carrier: a delivery
// or a generated label, and a failed delivery or a failed label (see the repository).
export type CarrierTotals = {
  carrier: string
  deliveries: number
  failures: number
  // Cancelled by the user: shown for context, never part of the success rate.
  cancelled: number
  avgDays: number | null
}

// Shape of each item in GET /stats/carriers (snake_case to match the existing API).
export type CarrierStat = {
  carrier: string
  success_rate: number
  avg_days: number | null
  total_shipments: number
  deliveries: number
  failures: number
  cancelled: number
  performance_score: number
  status: CarrierStatus
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Weighted score: reliability matters more than speed (70/30).
export function performanceScore(successRate: number, avgDays: number | null): number {
  // Without delivery times we can't judge speed, so use a neutral 0.5.
  // Speed is capped at 1: in the original Rails version 1/avg_days could exceed 1
  // for same-day deliveries (or divide by zero at 0 days), pushing the score past
  // the 0–1 range the dashboard expects.
  const speed = avgDays === null ? 0.5 : Math.min(1, 1 / Math.max(avgDays, 1))
  return round2(successRate * 0.7 + speed * 0.3)
}

// "unknown" means no finished shipments, not a 0% rate: in the Rails version a
// carrier that failed every shipment was labelled "unknown" instead of "bad".
export function statusLabel(successRate: number, finished: number): CarrierStatus {
  if (finished === 0) return 'unknown'
  if (successRate >= 0.95) return 'excellent'
  if (successRate >= 0.85) return 'good'
  if (successRate >= 0.7) return 'warning'
  return 'bad'
}

export function buildCarrierStat(totals: CarrierTotals): CarrierStat {
  // In-transit and cancelled shipments don't count: they haven't succeeded or
  // failed because of the carrier.
  const total = totals.deliveries + totals.failures
  const successRate = total === 0 ? 0 : totals.deliveries / total

  return {
    carrier: totals.carrier,
    success_rate: round2(successRate),
    avg_days: totals.avgDays === null ? null : round2(totals.avgDays),
    total_shipments: total,
    deliveries: totals.deliveries,
    failures: totals.failures,
    cancelled: totals.cancelled,
    // Use the unrounded rate so the score isn't affected by display rounding.
    performance_score: performanceScore(successRate, totals.avgDays),
    status: statusLabel(successRate, total),
  }
}

export function rankCarriers(totals: CarrierTotals[]): CarrierStat[] {
  return totals.map(buildCarrierStat).sort((a, b) => b.performance_score - a.performance_score)
}
