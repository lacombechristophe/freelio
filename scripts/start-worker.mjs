// Check before importing modules that open Redis connections.
if (process.env.DEMO_ACCESS_MODE === "readonly" || process.env.NEXT_PUBLIC_DEMO_READ_ONLY === "true") {
  throw new Error("Le worker est interdit dans la démonstration publique")
}
await import("../src/worker.ts")
