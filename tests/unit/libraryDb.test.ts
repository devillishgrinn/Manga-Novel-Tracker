import { beforeEach, describe, expect, it } from "vitest"
import { createSourceSeriesIdentity } from "../../src/core/adapter"
import {
  linkSourceSeries,
  listLibraryEntries,
  listSourceHealth,
  recordSeriesRefresh,
  resetMemoryDatabaseForTests,
  saveProgress,
  saveSourceHealth,
  setPreferredSource,
} from "../../src/core/libraryDb"
import { ProgressSnapshot } from "../../src/core/models"

function snapshot(sourceId: string, externalId: string, title: string, progress: number): ProgressSnapshot {
  const identity = createSourceSeriesIdentity(
    sourceId,
    `https://${sourceId}.example/series/${externalId}`,
    externalId,
  )
  return {
    identity,
    title,
    mediaType: "novel",
    progress,
    unit: "chapter",
    chapterUrl: `https://${sourceId}.example/series/${externalId}/chapter/${progress}`,
  }
}

describe("libraryDb", () => {
  beforeEach(() => resetMemoryDatabaseForTests())

  it("keeps same-title source series separate until the user explicitly links them", async () => {
    await saveProgress(snapshot("novelbin", "123", "Shared Title", 5))
    await saveProgress(snapshot("asura", "456", "Shared Title", 8))
    expect(await listLibraryEntries()).toHaveLength(2)
  })

  it("links a selected source and retains the higher progress", async () => {
    const first = await saveProgress(snapshot("novelbin", "123", "Shared Title", 5))
    await saveProgress(snapshot("asura", "456", "Shared Title", 8))
    const entries = await listLibraryEntries()
    const other = entries.find((entry) => entry.series.id !== first.id)!
    await linkSourceSeries(first.id, other.preferredSource.id)
    const linked = await listLibraryEntries()
    expect(linked).toHaveLength(1)
    expect(linked[0].series.progress).toBe(8)
    expect(linked[0].sources).toHaveLength(2)
  })

  it("establishes a baseline before reporting a later release", async () => {
    const series = await saveProgress(snapshot("novelbin", "123", "Source Story", 5))
    const source = (await listLibraryEntries()).find(
      (entry) => entry.series.id === series.id,
    )!.preferredSource
    const baseline = await recordSeriesRefresh({ identity: source, latestChapter: 8 }, source.id)
    const release = await recordSeriesRefresh({ identity: source, latestChapter: 9 }, source.id)
    expect(baseline?.status).toBe("baseline")
    expect(release?.hasNewRelease).toBe(true)
  })

  it("sets a preferred source only when it belongs to the library series", async () => {
    const series = await saveProgress(snapshot("novelbin", "123", "Source Story", 5))
    await saveProgress(snapshot("asura", "456", "Source Story", 5))
    const entries = await listLibraryEntries()
    const other = entries.find((entry) => entry.series.id !== series.id)!
    await linkSourceSeries(series.id, other.preferredSource.id)
    await setPreferredSource(series.id, other.preferredSource.id)
    expect((await listLibraryEntries())[0].series.preferredSourceSeriesId).toBe(other.preferredSource.id)
  })

  it("persists source health records by sourceId", async () => {
    await saveSourceHealth({
      sourceId: "novelbin",
      status: "healthy",
      responseTime: 420,
      lastChecked: 1_700_000_000_000,
    })
    await saveSourceHealth({
      sourceId: "novelbin",
      status: "broken",
      responseTime: 0,
      lastChecked: 1_700_000_100_000,
      lastError: "Request failed (503)",
    })
    const records = await listSourceHealth()
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe("broken")
    expect(records[0].lastError).toBe("Request failed (503)")
  })
})
