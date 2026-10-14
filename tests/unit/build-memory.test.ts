import path from "node:path"
import { pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import { expect, it } from "vitest"

it.each(["--enable-source-maps", "--enable-source-maps --max-old-space-size=1024"])(
  "passes the build memory budget to Next's CLI compiler with %s", options => {
    const run = spawnSync(process.execPath, [
      "--max-old-space-size=4096",
      "--import", pathToFileURL(path.resolve("scripts/build-memory.mjs")).href,
      "--eval", `
        const { runTypeScriptCli } = require("next/dist/lib/typescript/runTypeScriptCli");
        runTypeScriptCli({
          cwd: process.cwd(), tscPath: "--eval", captureOutput: true,
          args: ["console.log(JSON.stringify({ options: process.env.NODE_OPTIONS, heap: require('node:v8').getHeapStatistics().heap_size_limit, argv: process.execArgv }))"]
        }).then(result => {
          process.stdout.write(result.stdout);
          process.stderr.write(result.stderr);
          process.exitCode = result.exitCode;
        });
      `,
    ], { cwd: process.cwd(), encoding: "utf8", windowsHide: true, env: { ...process.env, NODE_OPTIONS: options } })
    expect(run.error).toBeUndefined()
    expect(run.stderr).toBe("")
    expect(run.status).toBe(0)
    const compiler = JSON.parse(run.stdout) as { options: string; heap: number; argv: string[] }
    expect(compiler.options).toContain("--enable-source-maps")
    expect(compiler.options).toMatch(/--max-old-space-size=4096$/)
    expect(compiler.heap).toBeGreaterThanOrEqual(4096 * 1024 * 1024)
    expect(compiler.argv).not.toContain("--max-old-space-size=4096")
  },
)
