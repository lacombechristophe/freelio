import { strToU8, zipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { decodeDelimitedText, parseMigrationArtifact } from "@/lib/migrations/ingest"

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

  it("decodes Windows-1252 exports without corrupting French characters", async () => {
    const bytes = Uint8Array.from([
      ...Buffer.from("ID;Nom;Montant\n42;Fran", "ascii"),
      0xe7, 0x6f, 0x69, 0x73, 0x3b, 0x31, 0x20, 0x32, 0x35, 0x30, 0x2c, 0x35, 0x30, 0x20, 0x80, 0x0a,
    ])
    const decoded = decodeDelimitedText(bytes)
    expect(decoded.encoding).toBe("windows-1252")
    expect(decoded.usedFallback).toBe(true)
    expect(decoded.text).toContain("François")
    expect(decoded.text).toContain("€")

    const result = await parseMigrationArtifact({ fileName: "clients.csv", bytes })
    expect(result.records[0].payload.Nom).toBe("François")
    expect(result.records[0].payload.Montant).toBe("1 250,50 €")
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "INGEST_CSV_ENCODING_FALLBACK", severity: "WARNING" }),
    ])
  })

  it("supports UTF-16LE exports with a BOM", async () => {
    const body = Buffer.from("ID\tNom\n1\tÉtang", "utf16le")
    const bytes = Uint8Array.from([0xff, 0xfe, ...body])
    const decoded = decodeDelimitedText(bytes)
    expect(decoded.encoding).toBe("utf-16le")
    expect(decoded.text).toContain("Étang")
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
