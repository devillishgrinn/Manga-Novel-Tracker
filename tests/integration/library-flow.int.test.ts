import { beforeEach, describe, expect, it } from "vitest"
import { createSourceSeriesIdentity } from "../../src/core/adapter"
import {
  exportLibraryBackup,
  importLibraryBackup,
  listLibraryEntries,
  resetMemoryDatabaseForTests,
  saveProgress,
} from "../../src/core/libraryDb"

describe("integration: local library backup", () => {
  beforeEach(() => resetMemoryDatabaseForTests())

  it("exports and imports a source-backed library without title matching", async () => {
    const identity = createSourceSeriesIdentity("novelbin", "https://novelbin.example/b/a", "a")
    await saveProgress({
      identity,
      title: "A Story",
      mediaType: "novel",
      progress: 3,
      unit: "chapter",
      chapterUrl: "https://novelbin.example/b/a/chapter-3",
    })
    const backup = await exportLibraryBackup()
    resetMemoryDatabaseForTests()
    await importLibraryBackup(backup)
    const entries = await listLibraryEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].preferredSource.id).toBe(identity.id)
  })
})
