const images = {
  postgres: { tag: "18.6-bookworm", digest: "sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c" },
  redis: { tag: "7.4-bookworm", digest: "sha256:4fa24486b8bcca8eec45ee0eb166edc674795e53a2b53d1a9ef263eecebaac85" },
}

/**
 * Only image acquisition is retried. Both official registries serve the same
 * pinned OCI index; migrations, seeds and container commands are never replayed.
 * @param {keyof typeof images} kind
 * @param {{
 *   pull: (reference: string) => void | Promise<void>,
 *   delay?: (milliseconds: number) => Promise<void>,
 *   record?: (attempt: { reference: string, attempt: number, outcome: string }) => void
 * }} options
 */
export async function pullRuntimeImage(kind, {
  pull,
  delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  record = () => {},
}) {
  const { tag, digest } = images[kind]
  const references = [
    `public.ecr.aws/docker/library/${kind}@${digest}`,
    `docker.io/library/${kind}@${digest}`,
  ]
  for (const reference of references) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await pull(reference)
      } catch (error) {
        const rateLimited = /toomanyrequests|rate exceeded|rate limit|\b429\b/i.test(String(error))
        record({ reference, attempt, outcome: rateLimited ? "rate-limited" : "failed" })
        if (!rateLimited) throw error
        if (attempt === 1) await delay(5000)
        continue
      }
      record({ reference, attempt, outcome: "available" })
      return { reference, tag, digest }
    }
  }
  throw Error(`Quota de téléchargement atteint sur les deux registres officiels pour ${kind}`)
}
