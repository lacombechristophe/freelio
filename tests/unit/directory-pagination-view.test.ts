import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DirectoryPagination } from "@/components/shared/directory-pagination"

describe("Pagination distinguishes unknown results from an empty directory", () => {
  const render = (total: number | null, pending = false, error = false) => renderToStaticMarkup(createElement(DirectoryPagination, { total, page: 2, pending, error, onPage: () => {}, onRetry: () => {} }))
  it("does not announce zero results or allow navigation after an unknown-total failure", () => {
    const html = render(null, false, true)
    expect(html).toContain("Total indisponible")
    expect(html).not.toContain("0 résultat")
    expect(html).toContain("Réessayer")
    for (const label of ["Page précédente", "Page suivante"]) expect(html).toMatch(new RegExp(`<button(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  })
  it("keeps loading distinct from an empty successful response", () => {
    expect(render(null, true)).toContain("Actualisation…")
    expect(render(0)).toContain("0 résultats")
  })
})
