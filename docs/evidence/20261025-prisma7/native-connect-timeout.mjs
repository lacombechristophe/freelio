import assert from "node:assert/strict"
import net from "node:net"
import { createDatabaseClient } from "../../../src/lib/database-client.ts"

assert.equal(process.env.RECIPE_ISOLATED, "true", "Run only in an isolated qualification copy")
const sockets = new Set()
const server = net.createServer(socket => {
  sockets.add(socket)
  socket.on("close", () => sockets.delete(socket))
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
let client
const started = performance.now()
const report = { schema: "freelio.native-pool-timeout.v1", expectedTimeoutObserved: false }
try {
  // This owned socket accepts TCP but never answers the PostgreSQL handshake.
  // All connection values are fictional; no database or provider is contacted.
  client = createDatabaseClient(`postgresql://fictional:fictional@127.0.0.1:${server.address().port}/fictional_timeout?sslmode=disable`)
  await client.$queryRaw`SELECT 1`
} catch (error) {
  report.expectedTimeoutObserved = error instanceof Error && error.name === "Error" && error.code === undefined
    && ["Connection terminated due to connection timeout", "timeout exceeded when trying to connect"].includes(error.message)
  report.elapsedMilliseconds = Math.round(performance.now() - started)
} finally {
  for (const socket of sockets) socket.destroy()
  await client?.$disconnect()
  await new Promise(resolve => server.close(resolve))
}
console.log(JSON.stringify(report))
assert.equal(report.expectedTimeoutObserved, true, "Expected an uncoded pg pool timeout; generate the PostgreSQL client before running this fixture")
