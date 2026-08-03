import type { SeriesSnapshot, SourceHealth } from "./models"
import type { SourceAdapter } from "./adapter"

export const SLOW_RESPONSE_MS = 5_000

export type HealthResult = Omit<SourceHealth, "sourceId">

export function calculateHealth(
  snapshot: SeriesSnapshot | null,
  responseTime: number,
  error?: string,
): HealthResult {
  if (error || !snapshot) {
    return {
      status: "broken",
      responseTime,
      lastChecked: Date.now(),
      lastError: error ?? "Parser returned null",
    }
  }

  return {
    status: responseTime >= SLOW_RESPONSE_MS ? "warning" : "healthy",
    responseTime,
    lastChecked: Date.now(),
  }
}

export interface AdapterHealthRow {
  sourceId: string
  displayName: string
  health?: SourceHealth
}

export function mergeAdapterHealth(
  adapterList: readonly SourceAdapter[],
  records: readonly SourceHealth[],
): AdapterHealthRow[] {
  const bySourceId = new Map(records.map((record) => [record.sourceId, record]))
  return adapterList.map((adapter) => ({
    sourceId: adapter.id,
    displayName: adapter.displayName,
    health: bySourceId.get(adapter.id),
  }))
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
