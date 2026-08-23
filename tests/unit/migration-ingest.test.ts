import { strToU8, zipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { parseMigrationArtifact } from "@/lib/migrations/ingest"

describe("migration artifact ingestion", () => {
  it("parses semicolon CSV rows and keeps a stable source id", async () => {
    const result = await parseMigrationArtifact({
      fileName: "clients.csv",
      bytes: strToU8('ID;Nom;Note\n42;Dupont;"ligne 1\nligne 2"\n'),
    })

    expect(result.issues).toEqual([])
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({ objectType: "CLIENTS", sourceId: "42" })
    expect(result.records[0].payload.Note).toBe("ligne 1\nligne 2")
  })

  it("extracts result arrays from JSON exports", async () => {
    const result = await parseMigrationArtifact({
      fileName: "contacts.json",
      bytes: strToU8(JSON.stringify({ results: [{ id: "a", email: "a@example.com" }, { id: "b", email: "b@example.com" }] })),
      objectTypeHint: "contacts",
    })

    expect(result.records.map((record) => record.sourceId)).toEqual(["a", "b"])
    expect(result.records.every((record) => record.objectType === "contacts")).toBe(true)
  })

  it("reads supported files from ZIP archives and blocks traversal paths", async () => {
    const archive = zipSync({
      "exports/devis.csv": strToU8("id,total\nd-1,1000\n"),
      "documents/devis-d-1.pdf": strToU8("%PDF-test"),
      "../outside.csv": strToU8("id\nevil\n"),
    })
    const result = await parseMigrationArtifact({ fileName: "extrabat.zip", bytes: archive })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].sourceId).toBe("d-1")
    expect(result.embeddedFiles).toHaveLength(1)
    expect(result.embeddedFiles[0].sourcePath).toBe("documents/devis-d-1.pdf")
    expect(result.issues.some((issue) => issue.code === "INGEST_UNSAFE_ARCHIVE_PATH")).toBe(true)
  })
})
