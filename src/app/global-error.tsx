"use client"

import { useEffect } from "react"

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f8fb", color: "#101828" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ width: "min(100%, 520px)", border: "1px solid #dfe3eb", borderRadius: 18, background: "white", padding: 32, boxShadow: "0 20px 60px rgba(16,24,40,.08)" }}>
            <p style={{ margin: 0, color: "#175cd3", fontSize: 13, fontWeight: 700 }}>Freelio</p>
            <h1 style={{ margin: "12px 0 0", fontSize: 28 }}>L’application a rencontré un problème.</h1>
            <p style={{ margin: "12px 0 0", color: "#667085", lineHeight: 1.6 }}>Vos données ne sont pas perdues. Réessayez l’affichage ; si le problème persiste, transmettez la référence ci-dessous au support.</p>
            {error.digest ? <code style={{ display: "block", marginTop: 16, borderRadius: 8, background: "#f2f4f7", padding: 10, fontSize: 12 }}>Référence : {error.digest}</code> : null}
            <button type="button" onClick={retry} style={{ marginTop: 20, minHeight: 44, border: 0, borderRadius: 10, background: "#155eef", color: "white", padding: "0 18px", fontWeight: 650, cursor: "pointer" }}>Réessayer</button>
          </section>
        </main>
      </body>
    </html>
  )
}
