function* tokens(value: unknown): Generator<string> {
  if (value instanceof Date) { yield JSON.stringify(value.toJSON()); return }
  if (Array.isArray(value)) {
    yield "["
    for (let index = 0; index < value.length; index++) {
      if (index) yield ","
      yield* tokens(value[index] ?? null)
    }
    yield "]"
  } else if (value !== null && typeof value === "object") {
    yield "{"
    let first = true
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) continue
      if (!first) yield ","
      first = false
      yield JSON.stringify(key) + ":"
      yield* tokens(child)
    }
    yield "}"
  } else { yield JSON.stringify(value) ?? "null" }
}

// Pull one chunk at a time; no second complete JSON string or encoded buffer.
export function jsonResponseStream(value: unknown) {
  const iterator = tokens(value)
  const encoder = new TextEncoder()
  let pending = ""
  let finished = false
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      while (pending.length < 32_768 && !finished) {
        const item = iterator.next()
        finished = Boolean(item.done)
        if (!item.done) pending += item.value
      }
      if (pending.length) {
        let length = Math.min(pending.length, 32_768)
        const last = pending.charCodeAt(length - 1)
        if (last >= 0xd800 && last <= 0xdbff) length--
        controller.enqueue(encoder.encode(pending.slice(0, length)))
        pending = pending.slice(length)
      } else if (finished) controller.close()
    },
    cancel() { iterator.return(undefined); pending = "" },
  })
}
