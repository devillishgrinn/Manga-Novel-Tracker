import { describe, expect, it } from "vitest"
import { createSourceSeriesIdentity } from "../../src/core/adapter"
import { adapters } from "../../src/core/registry"
import {
  calculateHealth,
  formatRelativeTime,
  mergeAdapterHealth,
  SLOW_RESPONSE_MS,
} from "../../src/core/sourceHealth"
import type { SeriesSnapshot, SourceHealth } from "../../src/core/models"

function sampleSnapshot(): SeriesSnapshot {
  const identity = createSourceSeriesIdentity("novelbin", "https://novelbin.com/b/example")
  return {
    identity,
    title: "Example Story",
    latestChapter: 12,
  }
}

describe("calculateHealth", () => {
  it("returns broken when the parser fails or returns null", () => {
    const health = calculateHealth(null, 120, "Request failed (404)")
    expect(health.status).toBe("broken")
    expect(health.lastError).toBe("Request failed (404)")
    expect(health.responseTime).toBe(120)
  })

  it("returns healthy for a fast successful parse", () => {
    const health = calculateHealth(sampleSnapshot(), 900)
    expect(health.status).toBe("healthy")
    expect(health.lastError).toBeUndefined()
  })

  it("returns warning when the response is slow but parse succeeds", () => {
    const health = calculateHealth(sampleSnapshot(), SLOW_RESPONSE_MS)
    expect(health.status).toBe("warning")
  })
})

describe("mergeAdapterHealth", () => {
  it("lists every registered adapter and attaches stored health when present", () => {
    const records: SourceHealth[] = [
      {
        sourceId: "novelbin",
        status: "healthy",
        responseTime: 400,
        lastChecked: 1_700_000_000_000,
      },
    ]
    const rows = mergeAdapterHealth(adapters, records)
    expect(rows).toHaveLength(adapters.length)
    expect(rows.find((row) => row.sourceId === "novelbin")?.health?.status).toBe("healthy")
    expect(rows.find((row) => row.sourceId === "fenrirealm")?.health).toBeUndefined()
  })
})

describe("formatRelativeTime", () => {
  it("formats recent and older timestamps", () => {
    const now = 1_700_000_000_000
    expect(formatRelativeTime(now - 30_000, now)).toBe("Just now")
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5m ago")
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe("3h ago")
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60_000, now)).toBe("2d ago")
  })
})
